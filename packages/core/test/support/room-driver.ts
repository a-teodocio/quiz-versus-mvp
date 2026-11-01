import { encodeServerMessage } from '@quiz-versus/protocol';
import type { Answer, GameSettings, ServerMessage } from '@quiz-versus/protocol';
import type { GamePlan } from '../../src/game/game-plan.js';
import type { Item } from '../../src/quiz/item.js';
import type { Effect } from '../../src/room/effects.js';
import type { RoomEvent } from '../../src/room/events.js';
import { step } from '../../src/room/reducer.js';
import { defaultRules } from '../../src/room/rules.js';
import type { Rules } from '../../src/room/rules.js';
import { createRoom } from '../../src/room/state.js';
import type { QuestionRoom, RoomState } from '../../src/room/state.js';

/** Ids that satisfy the protocol's opaque id rules (16 to 64 URL-safe characters). */
export const playerIdOf = (n: number): string => `player-${String(n).padStart(10, '0')}`;
export const tokenOf = (n: number): string => `token-${String(n).padStart(11, '0')}`;

const OPTIONS = ['Alpha option', 'Bravo option', 'Charlie option', 'Delta option'];

/** A pick item whose correct answer sits at `correctIndex` (as shown to players). */
export function pickItem(key: string, correctIndex = 0): Item {
  return {
    key,
    contentId: `content-${key}`,
    prompt: `Prompt ${key}?`,
    imageAlias: undefined,
    part: undefined,
    options: OPTIONS,
    correctIndex,
    explanation: `Explanation ${key}.`,
    mode: 'pick',
    acceptedForms: [],
  };
}

/** A typed item whose correct answer is "Zorbulin". */
export function typedItem(key: string): Item {
  return {
    ...pickItem(key, 1),
    options: ['Alpha option', 'Zorbulin', 'Charlie option', 'Delta option'],
    mode: 'type',
    acceptedForms: ['Zorbulin'],
  };
}

export function planOf(regular: readonly Item[], spare: readonly Item[] = []): GamePlan {
  return { regular, spare, images: new Map() };
}

export function settingsFor(questionCount: number): GameSettings {
  return { quizIds: ['fake-quiz'], questionCount, secondsPerQuestion: 30, answerBy: 'pick' };
}

/**
 * Drives the pure state machine the way an adapter would, and checks that every message it
 * produces is valid on the wire (the protocol's own encoder rejects anything that is not).
 */
export class RoomDriver {
  state: RoomState = createRoom('room-aaaaaaaaaaaaaaaa');
  now = 1_000_000;
  private joined = 0;

  constructor(private readonly rules: Rules = defaultRules) {}

  send(
    event: RoomEvent extends infer E ? (E extends { now: number } ? Omit<E, 'now'> : never) : never,
  ): readonly Effect[] {
    const { state, effects } = step(this.state, { ...event, now: this.now }, this.rules);
    this.state = state;
    for (const effect of effects) {
      if (effect.type === 'send') encodeServerMessage(effect.message);
    }
    return effects;
  }

  /** A new player joins; returns their id. */
  join(name = 'Player'): string {
    this.joined += 1;
    const playerId = playerIdOf(this.joined);
    this.send({
      type: 'join',
      name,
      identity: { playerId, resumeToken: tokenOf(this.joined) },
      resumeToken: undefined,
    });
    return playerId;
  }

  joinMany(count: number): string[] {
    return Array.from({ length: count }, (_, at) => this.join(`Player ${String(at + 1)}`));
  }

  start(
    hostId: string,
    plan: GamePlan,
    settings = settingsFor(plan.regular.length),
  ): readonly Effect[] {
    return this.send({ type: 'start', playerId: hostId, settings, plan });
  }

  answer(playerId: string, answer: Answer, itemKey = this.open().open.item.key): readonly Effect[] {
    return this.send({ type: 'answer', playerId, itemKey, answer });
  }

  pick(playerId: string, index: number): readonly Effect[] {
    return this.answer(playerId, { kind: 'pick', index });
  }

  /** Answers correctly. */
  right(playerId: string): readonly Effect[] {
    return this.pick(playerId, this.open().open.item.correctIndex);
  }

  /** Answers wrongly. */
  wrong(playerId: string): readonly Effect[] {
    return this.pick(playerId, (this.open().open.item.correctIndex + 1) % 4);
  }

  advance(ms: number): void {
    this.now += ms;
  }

  /** Lets the open question run out. */
  timeout(): readonly Effect[] {
    this.now = this.open().open.deadline;
    return this.send({ type: 'timerFired' });
  }

  next(hostId: string): readonly Effect[] {
    return this.send({ type: 'next', playerId: hostId });
  }

  open(): QuestionRoom {
    if (this.state.phase !== 'question') {
      throw new Error(`expected a question, the room is in ${this.state.phase}`);
    }
    return this.state;
  }

  score(playerId: string): number {
    return this.state.seats.find((seat) => seat.id === playerId)?.score ?? Number.NaN;
  }
}

/** The messages in a list of effects, optionally only those for one recipient kind. */
export function messages(effects: readonly Effect[], to?: 'caller' | 'everyone'): ServerMessage[] {
  return effects.flatMap((effect) =>
    effect.type === 'send' && (to === undefined || effect.to.kind === to) ? [effect.message] : [],
  );
}

export function messagesOfType<T extends ServerMessage['type']>(
  effects: readonly Effect[],
  type: T,
): Extract<ServerMessage, { type: T }>[] {
  return messages(effects).filter(
    (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
  );
}

export function errorCodes(effects: readonly Effect[]): string[] {
  return messagesOfType(effects, 'error').map((message) => message.code);
}
