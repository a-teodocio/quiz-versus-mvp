import { describe, expect, it } from 'vitest';
import cases from '../../test/fixtures/real-app/shuffle.json';
import { fixedRandom, seededRandom } from '../../test/support/fakes.js';
import { shuffle, shuffleOptions } from './shuffle.js';

describe('parity with the real app (fixtures/real-app/shuffle.json)', () => {
  it.each(cases)('$name', (fixture) => {
    const result = shuffleOptions(fixture.options, fixture.correct, fixedRandom(fixture.randoms));
    expect(result.options).toEqual(fixture.expectedOptions);
    expect(result.correctIndex).toBe(fixture.expectedCorrect);
  });
});

describe('shuffle', () => {
  it('returns a new array and leaves the input alone', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffle(input, seededRandom(1));
    expect(result).not.toBe(input);
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps every item exactly once', () => {
    const input = Array.from({ length: 20 }, (_, at) => at);
    expect([...shuffle(input, seededRandom(7))].sort((a, b) => a - b)).toEqual(input);
  });

  it('handles empty and single-item lists without drawing', () => {
    const random = { next: (): number => Number.NaN };
    expect(shuffle([], random)).toEqual([]);
    expect(shuffle(['only'], random)).toEqual(['only']);
  });
});

describe('shuffleOptions', () => {
  it('keeps the correct text at the reported index for any order', () => {
    const options = ['one', 'two', 'three', 'four'];
    for (let seed = 1; seed <= 50; seed++) {
      const shuffled = shuffleOptions(options, 2, seededRandom(seed));
      expect(shuffled.options[shuffled.correctIndex]).toBe('three');
    }
  });
});
