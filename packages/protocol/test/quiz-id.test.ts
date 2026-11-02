import { describe, expect, it } from 'vitest';
import { isQuizId, MAX_QUIZ_ID_LENGTH } from '../src/index.js';

describe('isQuizId', () => {
  it.each<[string, string, boolean]>([
    ['lowercase words joined by hyphens', 'birds-w1-plumage', true],
    ['digits', 'rocks-ch3-2', true],
    ['the maximum length', 'a'.repeat(MAX_QUIZ_ID_LENGTH), true],
    ['one over the maximum', 'a'.repeat(MAX_QUIZ_ID_LENGTH + 1), false],
    ['empty', '', false],
    ['an upper-case letter', 'Birds-w1', false],
    ['an underscore', 'birds_w1', false],
    ['a leading hyphen', '-birds', false],
    ['a double hyphen', 'birds--w1', false],
    ['a path', '../birds', false],
    ['a file extension', 'birds-w1.json', false],
  ])('%s', (_name, text, expected) => {
    expect(isQuizId(text)).toBe(expected);
  });
});
