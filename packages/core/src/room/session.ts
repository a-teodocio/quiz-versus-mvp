import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { Effect } from './effects.js';
import type { RoomEvent } from './events.js';
import { step } from './reducer.js';
import { defaultRules } from './rules.js';
import type { Rules } from './rules.js';
import { createRoom } from './state.js';
import type { RoomState } from './state.js';

/** An event as the adapter builds it: the session adds the time. */
export type RoomInput = RoomEvent extends infer E
  ? E extends { readonly now: number }
    ? Omit<E, 'now'>
    : never
  : never;

/** The error code of a refused request, if the effects hold one. Logged without any detail. */
function refusalCode(effects: readonly Effect[]): string | undefined {
  for (const effect of effects) {
    if (effect.type === 'send' && effect.message.type === 'error') return effect.message.code;
  }
  return undefined;
}

/** What a session needs from outside. */
export interface RoomSessionDeps {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly rules?: Rules;
}

/**
 * One room held in memory: the thin shell around the pure `step` function. It stamps each event
 * with the time from the `Clock`, keeps the current state and logs what happened (never answers,
 * names or tokens). An adapter owns one session per room, and carries out the returned effects.
 */
export class RoomSession {
  private current: RoomState;

  constructor(
    roomId: string,
    private readonly deps: RoomSessionDeps,
  ) {
    this.current = createRoom(roomId);
  }

  get state(): RoomState {
    return this.current;
  }

  /** Applies one event and returns what the adapter must do about it. */
  handle(input: RoomInput): readonly Effect[] {
    // `input` is one member of the RoomEvent union minus `now`; adding `now` gives that member back,
    // which TypeScript cannot see through the distributive Omit.
    const event = { ...input, now: this.deps.clock.now() } as RoomEvent;
    const before = this.current.phase;
    const { state, effects } = step(this.current, event, this.deps.rules ?? defaultRules);
    this.current = state;
    const refused = refusalCode(effects);
    this.deps.logger.info('room.event', {
      event: event.type,
      phase: state.phase,
      ...(refused === undefined ? {} : { refused }),
    });
    if (state.phase !== before) {
      this.deps.logger.info('room.phase', { from: before, to: state.phase });
    }
    return effects;
  }
}
