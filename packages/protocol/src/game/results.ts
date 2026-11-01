import { z } from 'zod';
import { MAX_PLAYERS_PER_ROOM, MAX_QUESTIONS_PER_GAME, MAX_TIEBREAK_ROUNDS } from '../limits.js';
import { PlayerIdSchema, PlayerNameSchema } from '../room/identifiers.js';

/** One line of the final table. Players with equal scores share a rank. */
const StandingSchema = z.strictObject({
  playerId: PlayerIdSchema,
  name: PlayerNameSchema,
  rank: z.int().min(1).max(MAX_PLAYERS_PER_ROOM),
  score: z.int().min(0),
  // Tie-break answers count too, so a full game plus every tie-break round is the most.
  correctCount: z
    .int()
    .min(0)
    .max(MAX_QUESTIONS_PER_GAME + MAX_TIEBREAK_ROUNDS),
});

/** Sent once, after the last reveal. Best score first. */
export const ResultsMessageSchema = z.strictObject({
  type: z.literal('results'),
  standings: z.array(StandingSchema).min(1).max(MAX_PLAYERS_PER_ROOM),
});
/** The final table. */
export type ResultsMessage = z.infer<typeof ResultsMessageSchema>;
