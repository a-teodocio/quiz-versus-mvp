import {
  MAX_EXPLANATION_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_PROMPT_LENGTH,
} from '@quiz-versus/protocol';
import { describe, expect, it } from 'vitest';
import { askableProblem } from '../src/index.js';
import type { QuizQuestionFields } from '../src/index.js';

const fine: QuizQuestionFields = {
  id: 'q1',
  question: 'What colour is the circle?',
  options: ['Red', 'Blue', 'Green', 'Yellow'],
  correct: 2,
  explanation: 'The circle is green.',
};

describe('askableProblem', () => {
  it('is null for a question the protocol can carry', () => {
    expect(askableProblem(fine)).toBeNull();
  });

  it.each<[string, Partial<QuizQuestionFields>, string]>([
    ['three options', { options: ['a', 'b', 'c'] }, 'exactly 4 options'],
    ['a correct index past the end', { correct: 4 }, 'points at no option'],
    ['a negative correct index', { correct: -1 }, 'points at no option'],
    ['a fractional correct index', { correct: 1.5 }, 'points at no option'],
    ['an empty question', { question: '' }, 'empty or too long question'],
    ['a question over the limit', { question: 'q'.repeat(MAX_PROMPT_LENGTH + 1) }, 'question'],
    ['an empty option', { options: ['a', '', 'c', 'd'] }, 'empty or too long option'],
    [
      'an option over the limit',
      { options: ['a', 'b', 'c', 'd'.repeat(MAX_OPTION_LENGTH + 1)] },
      'option',
    ],
    ['an empty explanation', { explanation: '' }, 'empty or too long explanation'],
    [
      'an explanation over the limit',
      { explanation: 'e'.repeat(MAX_EXPLANATION_LENGTH + 1) },
      'explanation',
    ],
  ])('names the problem with %s', (_name, change, expected) => {
    expect(askableProblem({ ...fine, ...change })).toContain(expected);
  });

  it('counts UTF-16 units, so text that is short in code points can still be refused', () => {
    const emoji = '🙂';
    expect(emoji).toHaveLength(2);
    // Half the limit in emoji is the whole limit in UTF-16 units, and one more is over it.
    const atLimit = emoji.repeat(MAX_OPTION_LENGTH / 2);
    const overLimit = emoji.repeat(MAX_OPTION_LENGTH / 2 + 1);
    expect(askableProblem({ ...fine, options: ['a', 'b', 'c', atLimit] })).toBeNull();
    expect(askableProblem({ ...fine, options: ['a', 'b', 'c', overLimit] })).toContain('option');
  });
});
