import { z } from 'zod';
import {
  MAX_ACCEPTED_FORMS,
  MAX_EXPLANATION_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_PLAYERS_PER_ROOM,
  OPTION_COUNT,
} from '../limits.js';
import { PlayerIdSchema } from '../room/identifiers.js';
import { AnswerSchema } from './answer.js';
import { ItemKeySchema } from './item-key.js';

/** The correct answer, in the same form the question was asked in. */
const CorrectAnswerSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('pick'),
    /** Index into the options as shown, i.e. after the shuffle. */
    index: z
      .int()
      .min(0)
      .max(OPTION_COUNT - 1),
    text: z.string().min(1).max(MAX_OPTION_LENGTH),
  }),
  z.strictObject({
    kind: z.literal('type'),
    text: z.string().min(1).max(MAX_OPTION_LENGTH),
    /** Every text the checker accepts, so a client can show what a near miss was closest to. */
    acceptedForms: z.array(z.string().min(1).max(MAX_OPTION_LENGTH)).min(1).max(MAX_ACCEPTED_FORMS),
  }),
]);

/** How one player did on the question that just closed. */
const PlayerResultSchema = z.strictObject({
  playerId: PlayerIdSchema,
  outcome: z.enum(['correct', 'wrong', 'no-answer']),
  /** A wrong typed answer within a letter or two of a right one. Still wrong. */
  near: z.boolean(),
  /** Points earned on this question, including any speed bonus. */
  points: z.int().min(0),
  /** Running total after this question. */
  score: z.int().min(0),
  /** What the player answered; null when they did not. */
  answer: AnswerSchema.nullable(),
});

/** Sent when a question closes. The first message that may contain the answer or explanation. */
export const RevealMessageSchema = z.strictObject({
  type: z.literal('reveal'),
  itemKey: ItemKeySchema,
  reason: z.enum(['all-answered', 'timeout']),
  correct: CorrectAnswerSchema,
  explanation: z.string().min(1).max(MAX_EXPLANATION_LENGTH),
  results: z.array(PlayerResultSchema).min(1).max(MAX_PLAYERS_PER_ROOM),
});
export type RevealMessage = z.infer<typeof RevealMessageSchema>;
