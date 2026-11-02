import { describe, expect, it } from 'vitest';
import { entryKeys } from '../file/entry-keys.js';
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

describe('entryKeys (the progress keys of the real app)', () => {
  it.each<[string, unknown, string[]]>([
    ['a question with an id', { type: 'text', id: 'q1', question: 'Q?' }, ['q1']],
    ['a question with no id, keyed by its text', { type: 'text', question: 'Q?' }, ['Q?']],
    ['a question with an empty id', { id: '', question: 'Q?' }, ['Q?']],
    ['a question with neither', { type: 'text' }, ['undefined']],
    [
      'a group, keyed by its parts',
      { type: 'image-group', id: 'g', parts: [{ id: 'g_p1' }, { id: 'g_p2' }] },
      ['g_p1', 'g_p2'],
    ],
    [
      'a group whose parts have no ids',
      { type: 'image-group', id: 'g', parts: [{}, { id: '' }, 5] },
      ['g#0', 'g#1', 'g#2'],
    ],
    ['a group with no id and no parts list', { type: 'image-group', parts: 'x' }, []],
    ['an entry that is not an object', 'text', []],
  ])('%s', (_name, entry, keys) => {
    expect(entryKeys(entry)).toEqual(keys);
  });
});
