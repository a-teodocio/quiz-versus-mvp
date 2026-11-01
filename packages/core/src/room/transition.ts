import type { Effect } from './effects.js';
import { refuse } from './effects.js';
import type { RoomState } from './state.js';

/** The result of applying one event: the next state and what to do about it. */
export interface Transition {
  readonly state: RoomState;
  readonly effects: readonly Effect[];
}

export const stay = (state: RoomState, ...effects: Effect[]): Transition => ({ state, effects });

/** State unchanged, request refused. Illegal moves are rejected, never silently ignored. */
export const reject = (
  state: RoomState,
  code: Parameters<typeof refuse>[0],
  message: string,
): Transition => stay(state, refuse(code, message));
