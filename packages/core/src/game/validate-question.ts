import {
  MAX_EXPLANATION_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_PROMPT_LENGTH,
  OPTION_COUNT,
} from '@quiz-versus/protocol';
import type { QuizQuestionFields } from '../quiz/model.js';
import { GameSetupError } from './game-plan.js';

const outOfRange = (text: string, max: number): boolean => text.length < 1 || text.length > max;

/**
 * What is wrong with a question for the wire, or null. Lengths are UTF-16 units, so this is
 * stricter than the wire schemas, which count code points. Public so a content checker can ask
 * the same question `prepareGame` will ask.
 */
export function askableProblem(fields: QuizQuestionFields): string | null {
  const { options, correct } = fields;
  if (options.length !== OPTION_COUNT) return `needs exactly ${String(OPTION_COUNT)} options`;
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
    return 'has a correct index that points at no option';
  }
  if (outOfRange(fields.question, MAX_PROMPT_LENGTH)) return 'has an empty or too long question';
  if (options.some((option) => outOfRange(option, MAX_OPTION_LENGTH))) {
    return 'has an empty or too long option';
  }
  if (outOfRange(fields.explanation, MAX_EXPLANATION_LENGTH)) {
    return 'has an empty or too long explanation';
  }
  return null;
}

/**
 * Refuses a question the protocol could not carry, at setup, so a bad quiz file fails before the
 * game starts instead of in the middle of it. The repository is not trusted to have validated.
 */
export function assertAskable(fields: QuizQuestionFields): void {
  const problem = askableProblem(fields);
  if (problem !== null)
    throw new GameSetupError('invalid-quiz', `question ${fields.id} ${problem}`);
}
