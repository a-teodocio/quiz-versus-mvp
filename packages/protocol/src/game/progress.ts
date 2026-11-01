import { z } from 'zod';
import { MAX_QUESTIONS_PER_GAME, MAX_TIEBREAK_ROUNDS } from '../limits.js';

/**
 * Where a question sits in the game. A regular question is one of the host's chosen count; a
 * tie-break question is an extra one asked only of the players tied for first place.
 */
export const ProgressSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('regular'),
      /** Position among the scored items of this game, from 1. A group part counts on its own. */
      position: z.int().min(1).max(MAX_QUESTIONS_PER_GAME),
      totalItems: z.int().min(1).max(MAX_QUESTIONS_PER_GAME),
    })
    .refine((progress) => progress.position <= progress.totalItems, {
      error: 'position is beyond the total',
    }),
  z.strictObject({
    kind: z.literal('tiebreak'),
    /** Which tie-break question this is, from 1. */
    round: z.int().min(1).max(MAX_TIEBREAK_ROUNDS),
  }),
]);
/** Where a question sits in the game: regular or tie-break. */
export type Progress = z.infer<typeof ProgressSchema>;
