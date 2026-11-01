import { z } from 'zod';
import {
  MAX_QUESTIONS_PER_GAME,
  MAX_QUIZZES_PER_GAME,
  MAX_SECONDS_PER_QUESTION,
  MIN_SECONDS_PER_QUESTION,
} from '../limits.js';
import { QuizIdSchema } from './identifiers.js';

/**
 * How answers are given. `type` asks for typed text where the real app can check it
 * automatically and falls back to `pick` for the rest (docs/fidelity.md).
 */
const AnswerBySchema = z.enum(['pick', 'type']);

/** What the host chooses when starting a game. */
export const GameSettingsSchema = z.strictObject({
  quizIds: z
    .array(QuizIdSchema)
    .min(1)
    .max(MAX_QUIZZES_PER_GAME)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'quiz ids must be unique' }),
  questionCount: z.int().min(1).max(MAX_QUESTIONS_PER_GAME),
  secondsPerQuestion: z.int().min(MIN_SECONDS_PER_QUESTION).max(MAX_SECONDS_PER_QUESTION),
  answerBy: AnswerBySchema,
});
/** The host's choices for one game. */
export type GameSettings = z.infer<typeof GameSettingsSchema>;
