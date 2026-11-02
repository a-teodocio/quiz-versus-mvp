import { describe, expect, it } from 'vitest';
import { isTruthy, jsText, pythonRepr, pythonText } from './json-values.js';

describe('isTruthy (Python truthiness)', () => {
  it.each<[string, unknown, boolean]>([
    ['null', null, false],
    ['zero', 0, false],
    ['a number', 3, true],
    ['an empty string', '', false],
    ['a space', ' ', true],
    ['an empty list', [], false],
    ['a list', [0], true],
    ['an empty object', {}, false],
    ['an object', { a: 1 }, true],
    ['false', false, false],
  ])('%s', (_name, value, expected) => {
    expect(isTruthy(value)).toBe(expected);
  });
});

describe('pythonRepr and pythonText', () => {
  it.each<[string, unknown, string, string]>([
    ['None', null, 'None', 'None'],
    ['booleans', true, 'True', 'True'],
    ['a number', 12, '12', '12'],
    ['a string', 'abc', "'abc'", 'abc'],
    ['a string with a single quote', "it's", '"it\'s"', "it's"],
    ['a string with both quotes', 'it\'s "x"', "'it\\'s \"x\"'", 'it\'s "x"'],
    ['backslashes and new lines', 'a\\b\nc', "'a\\\\b\\nc'", 'a\\b\nc'],
    ['a tab and a bell', 'a\tb\x07', "'a\\tb\\x07'", 'a\tb\x07'],
    [
      'a non-breaking space',
      'a' + String.fromCodePoint(0xa0) + 'b',
      "'a\\xa0b'",
      'a' + String.fromCodePoint(0xa0) + 'b',
    ],
    [
      'an emoji is printable',
      String.fromCodePoint(0x1f642),
      "'" + String.fromCodePoint(0x1f642) + "'",
      String.fromCodePoint(0x1f642),
    ],
    [
      'a zero-width space',
      'a' + String.fromCodePoint(0x200b),
      "'a\\u200b'",
      'a' + String.fromCodePoint(0x200b),
    ],
    ['a list', [1, 'a'], "[1, 'a']", "[1, 'a']"],
    ['an object', { a: [true] }, "{'a': [True]}", "{'a': [True]}"],
  ])('%s', (_name, value, repr, text) => {
    expect(pythonRepr(value)).toBe(repr);
    expect(pythonText(value)).toBe(text);
  });
});

describe('jsText', () => {
  it.each<[string, unknown, string]>([
    ['a missing value', undefined, 'undefined'],
    ['null', null, 'undefined'],
    ['a string', 'q1', 'q1'],
    ['a number', 7, '7'],
    ['a boolean', true, 'true'],
    ['a list', ['a', 1], 'a,1'],
    ['an object', { a: 1 }, '[object Object]'],
  ])('%s', (_name, value, expected) => {
    expect(jsText(value)).toBe(expected);
  });
});
