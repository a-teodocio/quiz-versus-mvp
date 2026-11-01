import { z } from 'zod';
import { MAX_PLAYERS_PER_ROOM } from '../limits.js';
import { PlayerIdSchema, PlayerNameSchema, RoomIdSchema } from './identifiers.js';
import { GameSettingsSchema } from './settings.js';

/** The four states of a game room (docs/architecture.md). */
export const RoomPhaseSchema = z.enum(['lobby', 'question', 'reveal', 'results']);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

/** One player as everyone in the room sees them. */
export const PlayerSummarySchema = z.strictObject({
  id: PlayerIdSchema,
  name: PlayerNameSchema,
  connected: z.boolean(),
  /** True once this player has answered the open question. Says nothing about correctness. */
  answered: z.boolean(),
  score: z.int().min(0),
});
export type PlayerSummary = z.infer<typeof PlayerSummarySchema>;

/** Who is in the room and what state it is in. Sent again after every change. */
export const RoomSnapshotSchema = z.strictObject({
  roomId: RoomIdSchema,
  phase: RoomPhaseSchema,
  hostId: PlayerIdSchema,
  players: z.array(PlayerSummarySchema).min(1).max(MAX_PLAYERS_PER_ROOM),
  /** Null until the host starts the game. */
  settings: GameSettingsSchema.nullable(),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
