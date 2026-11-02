import { describe, expect, it } from 'vitest';
import { bracketLabels } from './letter-labels.js';
import { containsPhrase, countSentences, escapeForRegExp, normaliseText } from './normalise.js';

describe('normaliseText', () => {
  it.each<[string, string, string]>([
    ['lower-cases and trims', '  Hello World  ', 'hello world'],
    ['turns punctuation into spaces', 'Cell, wall.', 'cell wall'],
    ['keeps slashes and hyphens', 'Lime / shale-rich', 'lime / shale-rich'],
    ['collapses any run of white space', 'a \t\n b\u00a0c', 'a b c'],
    ['keeps accented letters', 'Café!', 'café'],
    ['keeps letters of other scripts and digits', '漢字 12', '漢字 12'],
    ['keeps underscores', 'one_01', 'one_01'],
  ])('%s', (_name, text, expected) => {
    expect(normaliseText(text)).toBe(expected);
  });

  it('does not make "Naïve one" equal to "Na ve one" (an accented letter is a letter)', () => {
    expect(normaliseText('Naïve one')).not.toBe(normaliseText('Na ve one'));
  });
});

describe('containsPhrase', () => {
  it.each<[string, string, string, boolean]>([
    ['a whole word', 'the dye is red', 'red', true],
    ['inside a longer word', 'the dye is reddish', 'red', false],
    ['at the start and the end', 'red', 'red', true],
    ['beside an accented letter', 'a cafés table', 'café', false],
    ['after an accented letter', 'un éred', 'red', false],
    ['a phrase of several words', 'it is a cell wall here', 'cell wall', true],
    ['the second occurrence is whole', 'reds and red', 'red', true],
    ['nothing to look for', 'anything', '', false],
  ])('%s', (_name, haystack, needle, expected) => {
    expect(containsPhrase(haystack, needle)).toBe(expected);
  });
});

describe('countSentences', () => {
  it.each<[string, string, number]>([
    ['one sentence', 'It is so.', 1],
    ['three sentences', 'One. Two! Three?', 3],
    ['no split before a lower-case word', 'It is e.g. this one.', 1],
    [
      'a split before a digit, a quote or a bracket',
      'Yes. 4 is next. "Quoted" ends. (Bracketed) too.',
      4,
    ],
    ['white space around the text', '  One. Two.  ', 2],
    ['no text', '   ', 0],
  ])('%s', (_name, text, expected) => {
    expect(countSentences(text)).toBe(expected);
  });
});

describe('escapeForRegExp', () => {
  it('makes special characters match themselves', () => {
    const pattern = new RegExp(`^${escapeForRegExp('a.b*c(d)[e]')}$`);
    expect(pattern.test('a.b*c(d)[e]')).toBe(true);
    expect(pattern.test('aXb*c(d)[e]')).toBe(false);
  });
});

describe('bracketLabels', () => {
  it.each<[string, string, string]>([
    ['one letter after arrow', 'What does arrow a point to?', 'What does arrow (a) point to?'],
    ['a list of letters', 'Arrows a, b and c show it.', 'Arrows (a), (b) and (c) show it.'],
    ['a capital after labelled', 'The arrow labelled C is it.', 'The arrow labelled (C) is it.'],
    ['two or three capitals', 'Pointer GM is here.', 'Pointer (GM) is here.'],
    ['a label that opens an explanation', 'M marks the shaft.', '(M) marks the shaft.'],
    [
      'a letter already in brackets',
      'What does arrow (a) point to?',
      'What does arrow (a) point to?',
    ],
    ['a number', 'Pointer 1 shows what?', 'Pointer 1 shows what?'],
    [
      '"marks a" followed by a noun',
      'What marks a secondary feather?',
      'What marks a secondary feather?',
    ],
    ['"label a" followed by a verb', 'What does the label a show?', 'What does the label a show?'],
    ['an accented letter after the letter', 'What does arrow aé mean?', 'What does arrow aé mean?'],
    ['text with no label', 'What is a bird?', 'What is a bird?'],
  ])('%s', (_name, text, expected) => {
    expect(bracketLabels(text)).toBe(expected);
  });
});
