import { z } from 'zod';
import { MAX_PLAYERS_PER_ROOM, MAX_QUESTIONS_PER_GAME } from '../limits.js';
import { PlayerIdSchema, PlayerNameSchema } from '../room/identifiers.js';

/** One line of the final table. Players with equal scores share a rank. */
const StandingSchema = z.strictObject({
  playerId: PlayerIdSchema,
  name: PlayerNameSchema,
  rank: z.int().min(1).max(MAX_PLAYERS_PER_ROOM),
  score: z.int().min(0),
  correctCount: z.int().min(0).max(MAX_QUESTIONS_PER_GAME),
});

/** Sent once, after the last reveal. Best score first. */
export const ResultsMessageSchema = z.strictObject({
  type: z.literal('results'),
  standings: z.array(StandingSchema).min(1).max(MAX_PLAYERS_PER_ROOM),
});
export type ResultsMessage = z.infer<typeof ResultsMessageSchema>;
