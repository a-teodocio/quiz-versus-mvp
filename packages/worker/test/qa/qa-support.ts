import WebSocket from 'ws';
import type { ClientOptions } from 'ws';
import { PROTOCOL_VERSION } from '@quiz-versus/protocol';
import type { GameSettings, ServerMessage } from '@quiz-versus/protocol';

/** The server `npm run qa:start` runs. 127.0.0.1, not `localhost`: the server binds IPv4 loopback. */
export const HTTP = 'http://127.0.0.1:8787';
export const SOCKET = 'ws://127.0.0.1:8787';

/** Real time: the shortest question is 5 s, so a test that waits out a clock needs more than 5 s. */
export const SLOW = 90_000;
export const QUICK = 30_000;

export type Msg<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
export type Room = Msg<'room'>['room'];

interface Waiter {
  readonly accepts: (message: ServerMessage) => boolean;
  readonly resolve: (message: ServerMessage) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Wraps a promise so a message that never comes fails with a reason instead of hanging. */
export function within<T>(ms: number, promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(ms)} ms waiting for ${label}`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('failed'));
      },
    );
  });
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Every client opened by a test, so the afterEach can free the rooms (the cap is 5 per address). */
const opened: Player[] = [];

/** One scripted connection speaking the protocol. Keeps every frame, raw and parsed. */
export class Player {
  /** Every text frame received, exactly as the server wrote it. */
  readonly frames: string[] = [];
  /** Every message received, in order, parsed but not validated. */
  readonly history: ServerMessage[] = [];
  private readonly queue: ServerMessage[] = [];
  private readonly waiters: Waiter[] = [];
  readonly closed: Promise<number>;
  closeCode: number | undefined;
  playerId = '';
  resumeToken = '';
  name = '';
  /** The player sent `leave` (or was refused), so cleanup need not resume the seat. */
  gone = false;

  private constructor(
    readonly roomId: string,
    private readonly socket: WebSocket,
  ) {
    // A socket error after opening (a frame the server refuses) must not crash the test run.
    socket.on('error', () => undefined);
    this.closed = new Promise((resolve) => {
      socket.on('close', (code) => {
        this.closeCode = code;
        resolve(code);
      });
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      const text = Buffer.from(data as Buffer).toString('utf8');
      this.frames.push(text);
      const message = JSON.parse(text) as ServerMessage;
      this.history.push(message);
      const at = this.waiters.findIndex((waiter) => waiter.accepts(message));
      if (at >= 0) {
        const waiter = this.waiters.splice(at, 1)[0];
        if (waiter !== undefined) {
          clearTimeout(waiter.timer);
          waiter.resolve(message);
        }
      } else this.queue.push(message);
    });
  }

  /** Opens a socket to a room. Rejects with the HTTP status when the upgrade is refused. */
  static open(roomId: string, options: ClientOptions = {}, path?: string): Promise<Player> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${SOCKET}${path ?? `/rooms/${roomId}`}`, options);
      socket.once('unexpected-response', (_request, response) => {
        reject(new Error(`upgrade refused: ${String(response.statusCode ?? 0)}`));
        response.resume();
      });
      socket.once('error', (error) => {
        reject(error);
      });
      socket.once('open', () => {
        const player = new Player(roomId, socket);
        opened.push(player);
        resolve(player);
      });
    });
  }

  send(message: Record<string, unknown>): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(text: string): void {
    this.socket.send(text);
  }

  sendBinary(bytes: Uint8Array): void {
    this.socket.send(bytes, { binary: true });
  }

  /** Sends `join` and returns whatever the server answers first: `welcome` or `error`. */
  async tryJoin(name: string, resumeToken?: string): Promise<Msg<'welcome'> | Msg<'error'>> {
    this.name = name;
    this.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name,
      ...(resumeToken === undefined ? {} : { resumeToken }),
    });
    const answer = (await this.nextAny(['welcome', 'error'])) as Msg<'welcome'> | Msg<'error'>;
    if (answer.type === 'welcome') {
      this.playerId = answer.playerId;
      this.resumeToken = answer.resumeToken;
    }
    return answer;
  }

  /** Joins and expects to be welcomed. */
  async join(name: string, resumeToken?: string): Promise<Msg<'welcome'>> {
    const answer = await this.tryJoin(name, resumeToken);
    if (answer.type !== 'welcome') {
      throw new Error(`join as ${JSON.stringify(name)} was refused: ${answer.code}`);
    }
    return answer;
  }

  nextAny(types: readonly ServerMessage['type'][], ms = 15_000): Promise<ServerMessage> {
    return this.take((message) => types.includes(message.type), types.join(' or '), ms);
  }

  next<T extends ServerMessage['type']>(type: T, ms = 15_000): Promise<Msg<T>> {
    return this.take((message) => message.type === type, type, ms) as Promise<Msg<T>>;
  }

  /** The next `room` message in which the predicate holds (earlier ones are dropped). */
  async nextRoom(holds: (room: Room) => boolean, ms = 15_000): Promise<Room> {
    const deadline = Date.now() + ms;
    for (;;) {
      const { room } = await this.next('room', Math.max(1, deadline - Date.now()));
      if (holds(room)) return room;
    }
  }

  /** Messages that arrived and nobody asked for yet. */
  pending(type?: ServerMessage['type']): ServerMessage[] {
    return type === undefined ? [...this.queue] : this.queue.filter((m) => m.type === type);
  }

  /** Throws away what arrived so far, so a later check sees only what comes next. */
  clear(): void {
    this.queue.length = 0;
  }

  private take(
    accepts: (message: ServerMessage) => boolean,
    label: string,
    ms: number,
  ): Promise<ServerMessage> {
    const queued = this.queue.findIndex(accepts);
    const found = queued >= 0 ? this.queue.splice(queued, 1)[0] : undefined;
    if (found !== undefined) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (at >= 0) this.waiters.splice(at, 1);
        reject(new Error(`timed out after ${String(ms)} ms waiting for ${label} (${this.name})`));
      }, ms);
      this.waiters.push({ accepts, resolve, timer });
    });
  }

  leave(): void {
    this.gone = true;
    this.send({ type: 'leave' });
  }

  /** Drops the connection without a goodbye, as a phone losing signal would. */
  drop(): void {
    this.socket.terminate();
  }

  close(): void {
    this.socket.close();
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }
}

/** Makes a room over HTTP and returns its id. */
export async function createRoom(): Promise<string> {
  const response = await fetch(`${HTTP}/rooms`, { method: 'POST' });
  if (response.status !== 201) {
    throw new Error(`POST /rooms answered ${String(response.status)}: ${await response.text()}`);
  }
  return ((await response.json()) as { roomId: string }).roomId;
}

/** A room with players joined under these names, the first being the host. */
export async function lobby(
  names: readonly string[],
): Promise<{ roomId: string; players: Player[] }> {
  const roomId = await createRoom();
  const players: Player[] = [];
  for (const name of names) {
    const player = await Player.open(roomId);
    await player.join(name);
    players.push(player);
  }
  // Wait until the last player sees everyone, so the next step starts from a settled lobby.
  const last = players[players.length - 1];
  if (last !== undefined) await last.nextRoom((room) => room.players.length === names.length);
  return { roomId, players };
}

export const settings = (overrides: Partial<GameSettings> = {}): GameSettings => ({
  quizIds: ['birds-w1-plumage'],
  questionCount: 3,
  secondsPerQuestion: 5,
  answerBy: 'pick',
  ...overrides,
});

export const start = (host: Player, overrides: Partial<GameSettings> = {}): void => {
  host.send({ type: 'start', settings: settings(overrides) });
};

/**
 * Frees every room this test touched: each seat is resumed if it dropped, then leaves for good.
 * The server allows 5 rooms per address and a room with a dropped seat lives for ten minutes.
 */
export async function cleanup(): Promise<void> {
  const players = opened.splice(0);
  const seats = new Map<string, Player>();
  for (const player of players) {
    if (player.resumeToken !== '' && !player.gone) seats.set(player.resumeToken, player);
  }
  const leaving: Promise<unknown>[] = [];
  for (const seat of seats.values()) {
    leaving.push(
      (async () => {
        try {
          let current = seat;
          if (!current.isOpen || current.closeCode === 4001) {
            current = await Player.open(seat.roomId);
            const answer = await current.tryJoin(seat.name, seat.resumeToken);
            if (answer.type !== 'welcome') return;
          }
          current.leave();
          await within(3_000, current.closed, 'the socket to close after leave');
        } catch {
          // A room that is already gone needs no cleanup.
        }
      })(),
    );
  }
  await Promise.all(leaving);
  for (const player of players) {
    if (player.isOpen) player.close();
  }
  // Players opened during cleanup (resumes) are closed too.
  for (const player of opened.splice(0)) {
    if (player.isOpen) player.close();
  }
}

/** True when the text reads as a sentence for a person: no code in it, a capital, an end mark. */
export function isReadableSentence(text: string, code?: string): boolean {
  if (text.trim().length < 8) return false;
  if (code !== undefined && text.includes(code)) return false;
  if (/[A-Z]{3,}_[A-Z]{2,}/.test(text)) return false;
  return /^[A-Z]/.test(text) && /[.!?]$/.test(text);
}

/** What the server tells a person about each refusal, collected for the report. */
export const refusalLog: { context: string; code: string; message: string }[] = [];

export function noteRefusal(context: string, error: Msg<'error'>): void {
  refusalLog.push({ context, code: error.code, message: error.message });
}
