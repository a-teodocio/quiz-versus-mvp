import type { Item } from '../quiz/item.js';

/**
 * Everything the room needs to run one game, prepared before it starts so the state machine
 * needs no randomness and no loading (ADR 7).
 */
export interface GamePlan {
  /** The questions of the game, in the order they are asked. */
  readonly regular: readonly Item[];
  /** Questions held back for tie-breaks, at most MAX_TIEBREAK_ROUNDS. May be empty. */
  readonly spare: readonly Item[];
  /** Opaque image name (as in `/images/<name>`) to the file's `image_path` in its quiz. */
  readonly images: ReadonlyMap<string, string>;
}

/**
 * Why a game could not be set up. The adapter answers `INVALID_SETTINGS` for the first two; an
 * `invalid-quiz` is a content fault (a question or group the protocol cannot carry), not the
 * host's mistake, so it answers `INTERNAL_ERROR`.
 */
export type GameSetupFailure = 'unknown-quiz' | 'not-enough-questions' | 'invalid-quiz';

export class GameSetupError extends Error {
  constructor(
    readonly reason: GameSetupFailure,
    detail: string,
  ) {
    super(detail);
    this.name = 'GameSetupError';
  }
}
