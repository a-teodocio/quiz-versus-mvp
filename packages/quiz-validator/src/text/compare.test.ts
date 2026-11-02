import { describe, expect, it } from 'vitest';
import { compareCodePoints } from './compare.js';

/** U+FF5E is a single UTF-16 unit above the surrogates; U+1F600 is above it as a code point only. */
const FULLWIDTH_TILDE = String.fromCodePoint(0xff5e);
const EMOJI = String.fromCodePoint(0x1f600);

describe('compareCodePoints', () => {
  it.each<[string, string, string, number]>([
    ['equal text', 'abc', 'abc', 0],
    ['a smaller code point first', 'abc', 'abd', -1],
    ['a prefix before the longer text', 'ab', 'abc', -1],
    ['the longer text after its prefix', 'abc', 'ab', 1],
    ['empty before anything', '', 'a', -1],
    ['a character past U+FFFF after one at U+FF5E', `a${FULLWIDTH_TILDE}`, `a${EMOJI}`, -1],
    ['and the other way round', `a${EMOJI}`, `a${FULLWIDTH_TILDE}`, 1],
  ])('%s', (_name, a, b, sign) => {
    expect(Math.sign(compareCodePoints(a, b))).toBe(sign);
  });

  it('sorts a list the way Python sorts strings', () => {
    const names = ['b', `a${EMOJI}`, `a${FULLWIDTH_TILDE}`, 'a'];
    expect([...names].sort(compareCodePoints)).toEqual([
      'a',
      `a${FULLWIDTH_TILDE}`,
      `a${EMOJI}`,
      'b',
    ]);
  });
});
