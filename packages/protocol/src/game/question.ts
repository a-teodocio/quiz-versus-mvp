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
import { ProgressSchema } from './progress.js';

/**
 * A path under /images/ whose every segment is a plain name: it starts with a letter, digit, `_`,
 * `~` or `-`, then may contain dots. So there are no empty, `.` or `..` segments, no trailing
 * slash, no `%` (a percent-encoded dot cannot slip through), no query and no fragment.
 */
const IMAGE_PATH = /^\/images(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$/;

/** Which part of an image-group is on screen. Both numbers count from 1. */
const GroupPartSchema = z
  .strictObject({
    index: z.int().min(1).max(MAX_QUESTIONS_PER_GAME),
    count: z.int().min(1).max(MAX_QUESTIONS_PER_GAME),
  })
  .refine((part) => part.index <= part.count, { error: 'part index is beyond the part count' });

/**
 * Fields every question carries. Deliberately has no `correct`, `explanation` or accepted forms:
 * the server reveals those only after the question closes (review-checklist B3).
 */
const questionBase = {
  type: z.literal('question'),
  progress: ProgressSchema,
  itemKey: ItemKeySchema,
  prompt: z.string().min(1).max(MAX_PROMPT_LENGTH),
  /** Opaque path under /images/, so the file name cannot spell out the answer. */
  imageUrl: z.string().max(MAX_IMAGE_URL_LENGTH).regex(IMAGE_PATH).optional(),
  part: GroupPartSchema.optional(),
  /** How long the question stays open. A duration, not a deadline: client clocks drift. */
  durationMs: z
    .int()
    .positive()
    .max(MAX_SECONDS_PER_QUESTION * 1_000),
};

/**
 * One question to answer. Multiple choice carries the shuffled options; a typed question carries
 * none, because the options would hand the player a list containing the answer.
 */
export const QuestionMessageSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    ...questionBase,
    mode: z.literal('pick'),
    options: z.array(z.string().min(1).max(MAX_OPTION_LENGTH)).length(OPTION_COUNT),
  }),
  z.strictObject({ ...questionBase, mode: z.literal('type') }),
]);
/** A question as the server sends it. */
export type QuestionMessage = z.infer<typeof QuestionMessageSchema>;
