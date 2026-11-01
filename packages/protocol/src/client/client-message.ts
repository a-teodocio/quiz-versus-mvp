import { z } from 'zod';
import { AnswerSchema } from '../game/answer.js';
import { ItemKeySchema } from '../game/item-key.js';
import { PlayerNameSchema, ResumeTokenSchema } from '../room/identifiers.js';
import { GameSettingsSchema } from '../room/settings.js';

/**
 * First message on a connection. The room comes from the connection URL, not from this message.
 * `resumeToken` is set when a returning player takes their seat back after a dropped connection.
 */
const JoinSchema = z.strictObject({
  type: z.literal('join'),
  protocolVersion: z.int(),
  name: PlayerNameSchema,
  resumeToken: ResumeTokenSchema.optional(),
});

/** Host only, in the lobby. Starts the game with the chosen settings. */
const StartSchema = z.strictObject({ type: z.literal('start'), settings: GameSettingsSchema });

/** Answers the open question. `itemKey` must match the question currently open. */
const AnswerMessageSchema = z.strictObject({
  type: z.literal('answer'),
  itemKey: ItemKeySchema,
  answer: AnswerSchema,
});

/** Host only, after a reveal. Moves on to the next question or to the results. */
const NextSchema = z.strictObject({ type: z.literal('next') });

/** Leaves the room for good (a dropped connection is not a leave: the seat can be resumed). */
const LeaveSchema = z.strictObject({ type: z.literal('leave') });

/** Everything a client may send. */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinSchema,
  StartSchema,
  AnswerMessageSchema,
  NextSchema,
  LeaveSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
