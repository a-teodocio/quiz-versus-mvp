import { z } from 'zod';
import { ErrorCodeSchema } from '../errors/error-code.js';
import { ItemKeySchema } from '../game/item-key.js';
import { QuestionMessageSchema } from '../game/question.js';
import { RevealMessageSchema } from '../game/reveal.js';
import { ResultsMessageSchema } from '../game/results.js';
import { MAX_ERROR_MESSAGE_LENGTH } from '../limits.js';
import { PlayerIdSchema, ResumeTokenSchema, RoomIdSchema } from '../room/identifiers.js';
import { RoomSnapshotSchema } from '../room/snapshot.js';

/**
 * Reply to `join`. The server picks the player id; a client never chooses who it is. The resume
 * token is sent to this player only.
 */
const WelcomeSchema = z.strictObject({
  type: z.literal('welcome'),
  protocolVersion: z.int(),
  roomId: RoomIdSchema,
  playerId: PlayerIdSchema,
  resumeToken: ResumeTokenSchema,
});

/** The room as it stands now. Sent after every join, leave, disconnect, answer and phase change. */
const RoomSchema = z.strictObject({ type: z.literal('room'), room: RoomSnapshotSchema });

/** Confirms this player's answer was accepted. Says nothing about whether it was right. */
const AnswerAckSchema = z.strictObject({ type: z.literal('answerAck'), itemKey: ItemKeySchema });

/** A request was refused. `code` is stable; `message` is for display only. */
const ErrorSchema = z.strictObject({
  type: z.literal('error'),
  code: ErrorCodeSchema,
  message: z.string().min(1).max(MAX_ERROR_MESSAGE_LENGTH),
});

/** Everything the server may send. */
export const ServerMessageSchema = z.discriminatedUnion('type', [
  WelcomeSchema,
  RoomSchema,
  QuestionMessageSchema,
  AnswerAckSchema,
  RevealMessageSchema,
  ResultsMessageSchema,
  ErrorSchema,
]);
/** Any message the server may send. */
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
