import { describe, expect, it } from 'vitest';
import { entryKeys } from './entry-keys.js';

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
