import { GameSetupError, prepareGame } from '@quiz-versus/core';
import type { GamePlan, QuizRepository, Random } from '@quiz-versus/core';
import type { ErrorCode, GameSettings } from '@quiz-versus/protocol';
import { MAX_PREPARE_ATTEMPTS } from '../config/defaults.js';
import { ContentError } from '../content/content-error.js';
import type { ImageIndex } from '../content/image-index.js';

/** A picture name that two rooms would share, on every attempt. Practically never happens. */
export class PictureNameCollisionError extends Error {
  constructor() {
    super('picture names collided with another room on every attempt');
    this.name = 'PictureNameCollisionError';
  }
}

/** What `prepareGame` needs, and where picture names must stay unique. */
export interface GameSetupDeps {
  readonly repository: QuizRepository;
  readonly random: Random;
  readonly images: ImageIndex;
}

/**
 * Prepares a game, again if a picture name is already used by another room (names are random, so
 * a second attempt gets different ones). Throws `GameSetupError`, `ContentError` or
 * `PictureNameCollisionError`; `describeSetupFailure` turns any of them into a protocol error.
 */
export async function prepareUniqueGame(
  deps: GameSetupDeps,
  settings: GameSettings,
): Promise<GamePlan> {
  for (let attempt = 0; attempt < MAX_PREPARE_ATTEMPTS; attempt += 1) {
    const plan = await prepareGame(deps.repository, settings, deps.random);
    if (!deps.images.collidesWith(plan.images.keys())) return plan;
  }
  throw new PictureNameCollisionError();
}

/** What the host is told, and what is logged, when a game could not be set up. */
export interface SetupFailure {
  readonly code: ErrorCode;
  /** Plain words for the host. */
  readonly text: string;
  /** A short label for the log: a reason or an error name, never content. */
  readonly reason: string;
}

const REASONS: Readonly<Record<string, SetupFailure>> = {
  'unknown-quiz': {
    code: 'INVALID_SETTINGS',
    text: 'One of the chosen quizzes does not exist.',
    reason: 'unknown-quiz',
  },
  'not-enough-questions': {
    code: 'INVALID_SETTINGS',
    text: 'The chosen quizzes do not have enough questions.',
    reason: 'not-enough-questions',
  },
};

/** Sorts a failure into the host's mistake (`INVALID_SETTINGS`) or a fault of ours. */
export function describeSetupFailure(error: unknown): SetupFailure {
  const known = error instanceof GameSetupError ? REASONS[error.reason] : undefined;
  if (known !== undefined) return known;
  const reason =
    error instanceof ContentError
      ? `bad-content:${error.file}`
      : error instanceof Error
        ? error.name
        : 'unknown';
  return { code: 'INTERNAL_ERROR', text: 'The game could not be set up.', reason };
}
