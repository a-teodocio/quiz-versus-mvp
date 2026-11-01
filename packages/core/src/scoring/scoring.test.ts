import { describe, expect, it } from 'vitest';
import { rankPlayers } from './ranking.js';
import { pointsFor, standardScoring } from './scoring-rule.js';
import type { ScoringRule } from './scoring-rule.js';

const context = { progress: { kind: 'tiebreak', round: 1 } } as const;

describe('standard scoring', () => {
  it('gives 1 point for a correct answer and 0 for a wrong one', () => {
    expect(pointsFor(standardScoring, true, context)).toBe(1);
    expect(pointsFor(standardScoring, false, context)).toBe(0);
  });
});

describe('pointsFor keeps any rule safe for the wire', () => {
  it.each<[string, ScoringRule, number]>([
    ['rounds a fraction', () => 2.6, 3],
    ['clamps a negative to 0', () => -4, 0],
    ['replaces NaN with 0', () => Number.NaN, 0],
    ['replaces Infinity with 0', () => Number.POSITIVE_INFINITY, 0],
  ])('%s', (_name, rule, expected) => {
    expect(pointsFor(rule, true, context)).toBe(expected);
  });

  it('awards nothing for a wrong answer, whatever the rule says', () => {
    expect(pointsFor(() => 5, false, context)).toBe(0);
  });
});

describe('rankPlayers', () => {
  const ranks = (scores: number[]): number[] =>
    rankPlayers(scores.map((score, at) => ({ id: String(at), score }))).map((entry) => entry.rank);

  it('shares a rank between equal scores and skips the next one', () => {
    expect(ranks([9, 7, 7, 5])).toEqual([1, 2, 2, 4]);
    expect(ranks([7, 7, 4, 7])).toEqual([1, 1, 1, 4]);
  });

  it('orders best first and keeps the given order for equal scores', () => {
    const ordered = rankPlayers([
      { id: 'a', score: 1 },
      { id: 'b', score: 3 },
      { id: 'c', score: 1 },
    ]).map((entry) => entry.player.id);
    expect(ordered).toEqual(['b', 'a', 'c']);
  });
});
