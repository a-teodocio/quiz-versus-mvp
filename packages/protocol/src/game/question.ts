import { z } from 'zod';
import {
  MAX_IMAGE_URL_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_QUESTIONS_PER_GAME,
  MAX_SECONDS_PER_QUESTION,
  OPTION_COUNT,
} from '../limits.js';
import { ItemKeySchema } from './item-key.js';

/** A same-origin path: one leading slash, no scheme, no host, no whitespace. */
const IMAGE_PATH = /^\/(?!\/)[^\s\\]*$/;

/** Which part of an image-group is on screen. Both numbers count from 1. */
const GroupPartSchema = z
  .strictObject({ index: z.int().min(1), count: z.int().min(2) })
  .refine((part) => part.index <= part.count, { error: 'part index is beyond the part count' });

/**
 * Fields every question carries. Deliberately has no `correct`, `explanation` or accepted forms:
 * the server reveals those only after the question closes (review-checklist B3).
 */
const questionBase = {
  type: z.literal('question'),
  /** Position among the scored items of this game, from 1. A group part counts on its own. */
  position: z.int().min(1).max(MAX_QUESTIONS_PER_GAME),
  totalItems: z.int().min(1).max(MAX_QUESTIONS_PER_GAME),
  itemKey: ItemKeySchema,
  prompt: z.string().min(1).max(MAX_PROMPT_LENGTH),
  /** Opaque same-origin path, so the file name cannot spell out the answer. */
  imageUrl: z.string().max(MAX_IMAGE_URL_LENGTH).regex(IMAGE_PATH).optional(),
  part: GroupPartSchema.optional(),
  /** How long the question stays open. A duration, not a deadline: client clocks drift. */
  durationMs: z
    .int()
    .positive()
    .max(MAX_SECONDS_PER_QUESTION * 1_000),
};

const positionIsInRange = (question: { position: number; totalItems: number }): boolean =>
  question.position <= question.totalItems;

/**
 * One question to answer. Multiple choice carries the shuffled options; a typed question carries
 * none, because the options would hand the player a list containing the answer.
 */
export const QuestionMessageSchema = z.discriminatedUnion('mode', [
  z
    .strictObject({
      ...questionBase,
      mode: z.literal('pick'),
      options: z.array(z.string().min(1).max(MAX_OPTION_LENGTH)).length(OPTION_COUNT),
    })
    .refine(positionIsInRange, { error: 'position is beyond the total' }),
  z
    .strictObject({ ...questionBase, mode: z.literal('type') })
    .refine(positionIsInRange, { error: 'position is beyond the total' }),
]);
export type QuestionMessage = z.infer<typeof QuestionMessageSchema>;
