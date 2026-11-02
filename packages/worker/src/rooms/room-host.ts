import { RoomSession, step } from '@quiz-versus/core';
import type { Clock, Effect, QuizRepository, Random, RoomInput } from '@quiz-versus/core';
import { decodeClientMessage } from '@quiz-versus/protocol';
import type { ClientMessage, ErrorCode, GameSettings, ServerMessage } from '@quiz-versus/protocol';
import { JOIN_TIMEOUT_MS, MAX_CONNECTIONS_PER_ROOM } from '../config/defaults.js';
import type { ImageIndex } from '../content/image-index.js';
import type { IdSource } from '../ports/id-source.js';
import type { CancelTimer, Scheduler } from '../ports/scheduler.js';
import type { ServerLogger } from '../ports/server-logger.js';
import { CLOSE_NORMAL, CLOSE_POLICY, CLOSE_REPLACED } from './connection.js';
import type { Connection } from './connection.js';
import { describeSetupFailure, prepareUniqueGame } from './game-setup.js';
import { decodeFailureText, encodeOrLog, errorMessage } from './outbound.js';

/** What a room needs from outside. */
export interface RoomHostDeps {
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly random: Random;
  readonly ids: IdSource;
  readonly logger: ServerLogger;
  readonly repository: QuizRepository;
  readonly images: ImageIndex;
  readonly idleRoomMs: number;
}

/** What the room knows about one socket. */
interface Link {
  /** Set once the socket has joined and the room has said who it is. */
  playerId: string | undefined;
  /** The seat moved to a newer socket, or the player left: this socket no longer counts. */
  retired: boolean;
  cancelJoinTimer: CancelTimer;
}

const doNothing = (): void => undefined;

/** A timer firing has no socket behind it; core never addresses `caller` for that event. */
const NO_CALLER: Connection = { send: doNothing, close: doNothing };

/** The `INVALID_SETTINGS` core gives a start whose plan does not fit: every earlier check passed. */
const PLAN_CHECK: ErrorCode = 'INVALID_SETTINGS';

/** The code of the refusal in a list of effects, if there is one. */
function refusalCode(effects: readonly Effect[]): ErrorCode | undefined {
  for (const effect of effects) {
    if (effect.type === 'send' && effect.message.type === 'error') return effect.message.code;
  }
  return undefined;
}

/**
 * One room: the core state machine plus the sockets of its players. It decodes what arrives,
 * turns it into events, and carries out the effects core returns (sends, the question timer,
 * closing). It decides no game rule. Everything is synchronous except preparing a game, which
 * reads quiz files; only one preparation runs at a time.
 */
export class RoomHost {
  private readonly session: RoomSession;
  private readonly links = new Map<Connection, Link>();
  private readonly members = new Map<string, Connection>();
  private cancelGameTimer: CancelTimer = doNothing;
  private cancelIdleTimer: CancelTimer | undefined;
  private preparing = false;
  private closed = false;

  constructor(
    readonly roomId: string,
    private readonly deps: RoomHostDeps,
    private readonly onClosed: (roomId: string) => void,
  ) {
    this.session = new RoomSession(roomId, deps);
    this.refreshIdleTimer();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** A new socket for this room. It must send `join` soon, or it is closed. */
  attach(connection: Connection): void {
    if (this.closed) return;
    if (this.links.size >= MAX_CONNECTIONS_PER_ROOM) {
      this.refuse(connection, 'ROOM_FULL', 'This room is full.');
      connection.close(CLOSE_POLICY, 'room full');
      return;
    }
    const cancelJoinTimer = this.deps.scheduler.after(JOIN_TIMEOUT_MS, () => {
      this.dropUnjoined(connection);
    });
    this.links.set(connection, { playerId: undefined, retired: false, cancelJoinTimer });
  }

  /** A text frame from a socket. Never throws: a fault becomes `INTERNAL_ERROR` and a log line. */
  receive(connection: Connection, text: string): void {
    const link = this.links.get(connection);
    if (this.closed || link === undefined || link.retired) return;
    try {
      this.dispatch(connection, link, text);
    } catch (error) {
      this.deps.logger.error('room.fault', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      this.refuse(connection, 'INTERNAL_ERROR', 'Something went wrong on the server.');
    }
  }

  /** The socket closed. A seat is kept (the player can resume) unless the player had left. */
  detach(connection: Connection): void {
    const link = this.links.get(connection);
    if (link === undefined) return;
    link.cancelJoinTimer();
    this.links.delete(connection);
    const playerId = link.playerId;
    if (this.closed || link.retired || playerId === undefined) return;
    this.members.delete(playerId);
    this.contained(() => {
      this.apply(connection, { type: 'disconnect', playerId });
    });
  }

  /** Ends the room: timers stop, pictures are forgotten, every socket is closed. */
  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelGameTimer();
    this.cancelIdleTimer?.();
    this.deps.images.release(this.roomId);
    const connections = [...this.links.keys()];
    for (const link of this.links.values()) link.cancelJoinTimer();
    this.links.clear();
    this.members.clear();
    for (const connection of connections) connection.close(CLOSE_NORMAL, 'room closed');
    this.deps.logger.info('room.closed', { reason });
    this.onClosed(this.roomId);
  }

  private dispatch(connection: Connection, link: Link, text: string): void {
    const decoded = decodeClientMessage(text);
    if (!decoded.ok) {
      this.refuse(connection, decoded.code, decodeFailureText(decoded.code, decoded.detail));
      if (decoded.code === 'UNSUPPORTED_VERSION') connection.close(CLOSE_POLICY, 'version');
      return;
    }
    const message = decoded.message;
    if (message.type === 'join') {
      this.join(connection, link, message);
      return;
    }
    const playerId = link.playerId;
    if (playerId === undefined) {
      this.refuse(connection, 'NOT_JOINED', 'Join the room before sending anything else.');
      return;
    }
    switch (message.type) {
      case 'start': {
        this.start(connection, playerId, message.settings);
        return;
      }
      case 'answer': {
        this.apply(connection, {
          type: 'answer',
          playerId,
          itemKey: message.itemKey,
          answer: message.answer,
        });
        return;
      }
      case 'next': {
        this.apply(connection, { type: 'next', playerId });
        return;
      }
      case 'leave': {
        this.leave(connection, link, playerId);
        return;
      }
    }
  }

  private join(
    connection: Connection,
    link: Link,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): void {
    if (link.playerId !== undefined) {
      this.refuse(connection, 'ALREADY_JOINED', 'You have already joined this room.');
      return;
    }
    const effects = this.session.handle({
      type: 'join',
      name: message.name,
      identity: { playerId: this.deps.ids.next(), resumeToken: this.deps.ids.next() },
      resumeToken: message.resumeToken,
    });
    for (const effect of effects) {
      if (effect.type === 'send' && effect.message.type === 'welcome') {
        this.seat(connection, link, effect.message.playerId);
      }
    }
    this.run(effects, connection);
  }

  /** Ties a socket to its seat, closing an older socket that still holds the same seat. */
  private seat(connection: Connection, link: Link, playerId: string): void {
    const older = this.members.get(playerId);
    if (older !== undefined && older !== connection) {
      const olderLink = this.links.get(older);
      if (olderLink !== undefined) olderLink.retired = true;
      older.close(CLOSE_REPLACED, 'seat taken by a newer connection');
    }
    link.playerId = playerId;
    link.cancelJoinTimer();
    this.members.set(playerId, connection);
  }

  private leave(connection: Connection, link: Link, playerId: string): void {
    const effects = this.session.handle({ type: 'leave', playerId });
    if (!this.session.state.seats.some((seat) => seat.id === playerId)) {
      link.retired = true;
      this.members.delete(playerId);
    }
    this.run(effects, connection);
    if (link.retired) connection.close(CLOSE_NORMAL, 'left');
  }

  private start(connection: Connection, playerId: string, settings: GameSettings): void {
    const now = this.deps.clock.now();
    const empty = { regular: [], spare: [], images: new Map<string, string>() };
    const probe = step(this.session.state, { type: 'start', playerId, settings, plan: empty, now });
    const code = refusalCode(probe.effects);
    if (code !== undefined && code !== PLAN_CHECK) {
      this.apply(connection, { type: 'start', playerId, settings, plan: empty });
      return;
    }
    if (this.preparing) {
      this.refuse(connection, 'WRONG_PHASE', 'A game is already being set up.');
      return;
    }
    this.preparing = true;
    void this.prepareAndStart(connection, playerId, settings);
  }

  /** Never rejects: every failure is turned into an error message or a log line. */
  private async prepareAndStart(
    connection: Connection,
    playerId: string,
    settings: GameSettings,
  ): Promise<void> {
    try {
      const plan = await prepareUniqueGame(this.deps, settings);
      if (this.closed) return;
      this.deps.images.register(this.roomId, plan.images);
      this.apply(connection, { type: 'start', playerId, settings, plan });
      if (this.session.state.phase === 'lobby') this.deps.images.release(this.roomId);
    } catch (error) {
      if (this.closed) return;
      const failure = describeSetupFailure(error);
      this.deps.logger.error('game.setup_failed', { reason: failure.reason });
      this.refuse(connection, failure.code, failure.text);
    } finally {
      this.preparing = false;
    }
  }

  private apply(connection: Connection, input: RoomInput): void {
    this.run(this.session.handle(input), connection);
  }

  /** Carries out what core asked for. `caller` is the socket that caused the event. */
  private run(effects: readonly Effect[], caller: Connection): void {
    let closeRequested = false;
    for (const effect of effects) {
      switch (effect.type) {
        case 'send':
          this.deliver(effect, caller);
          break;
        case 'setTimer':
          this.setGameTimer(effect.at);
          break;
        case 'clearTimer':
          this.cancelGameTimer();
          this.cancelGameTimer = doNothing;
          break;
        case 'closeRoom':
          closeRequested = true;
          break;
      }
    }
    if (closeRequested) this.close('last player left');
    else this.refreshIdleTimer();
  }

  private deliver(effect: Extract<Effect, { type: 'send' }>, caller: Connection): void {
    const text = encodeOrLog(effect.message, this.deps.logger);
    if (text === undefined) return;
    const { to } = effect;
    switch (to.kind) {
      case 'caller':
        caller.send(text);
        break;
      case 'player':
        this.members.get(to.playerId)?.send(text);
        break;
      case 'everyone':
        for (const connection of this.members.values()) connection.send(text);
        break;
    }
  }

  private setGameTimer(at: number): void {
    this.cancelGameTimer();
    this.cancelGameTimer = this.deps.scheduler.after(at - this.deps.clock.now(), () => {
      this.cancelGameTimer = doNothing;
      if (this.closed) return;
      this.contained(() => {
        this.apply(NO_CALLER, { type: 'timerFired' });
      });
    });
  }

  /** A room with nobody connected is closed after a while; one with somebody is left alone. */
  private refreshIdleTimer(): void {
    if (this.closed) return;
    if (this.members.size > 0) {
      this.cancelIdleTimer?.();
      this.cancelIdleTimer = undefined;
    } else if (this.cancelIdleTimer === undefined) {
      this.cancelIdleTimer = this.deps.scheduler.after(this.deps.idleRoomMs, () => {
        this.close('idle');
      });
    }
  }

  /**
   * Runs an entry point that has no caller to answer (a timer, a socket closing). A fault there
   * ends this room and is logged; it never escapes to take down every other room (ADR 11).
   */
  private contained(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.deps.logger.error('room.fault', {
        error: error instanceof Error ? error.name : 'unknown',
        entry: 'background',
      });
      this.close('fault');
    }
  }

  private dropUnjoined(connection: Connection): void {
    const link = this.links.get(connection);
    if (link === undefined || link.playerId !== undefined) return;
    this.refuse(connection, 'NOT_JOINED', 'Join the room within a few seconds of connecting.');
    connection.close(CLOSE_POLICY, 'did not join');
  }

  private refuse(connection: Connection, code: ErrorCode, text: string): void {
    this.sendTo(connection, errorMessage(code, text));
  }

  private sendTo(connection: Connection, message: ServerMessage): void {
    const text = encodeOrLog(message, this.deps.logger);
    if (text !== undefined) connection.send(text);
  }
}
