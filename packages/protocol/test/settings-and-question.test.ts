import { describe, expect, it } from 'vitest';
import {
  decodeClientMessage,
  decodeServerMessage,
  MAX_QUESTIONS_PER_GAME,
  MAX_QUIZZES_PER_GAME,
  MAX_SECONDS_PER_QUESTION,
  MAX_TIEBREAK_ROUNDS,
  MIN_SECONDS_PER_QUESTION,
  PROTOCOL_VERSION,
} from '../src/index.js';
import { RESUME_TOKEN, SERVER_SAMPLES, SETTINGS } from './samples.js';

const start = (settings: Record<string, unknown>): boolean =>
  decodeClientMessage(JSON.stringify({ type: 'start', settings: { ...SETTINGS, ...settings } })).ok;

describe('start settings', () => {
  it.each<[string, Record<string, unknown>, boolean]>([
    ['the sample settings', {}, true],
    ['typed answers', { answerBy: 'type' }, true],
    ['an unknown answer mode', { answerBy: 'self' }, false],
    ['no quizzes', { quizIds: [] }, false],
    ['the maximum number of quizzes', { quizIds: manyQuizIds(MAX_QUIZZES_PER_GAME) }, true],
    ['one quiz too many', { quizIds: manyQuizIds(MAX_QUIZZES_PER_GAME + 1) }, false],
    ['a repeated quiz', { quizIds: ['fake-quiz', 'fake-quiz'] }, false],
    ['a quiz id with a path in it', { quizIds: ['../secret'] }, false],
    ['an upper-case quiz id', { quizIds: ['Fake-Quiz'] }, false],
    ['zero questions', { questionCount: 0 }, false],
    ['the most questions', { questionCount: MAX_QUESTIONS_PER_GAME }, true],
    ['one question too many', { questionCount: MAX_QUESTIONS_PER_GAME + 1 }, false],
    ['a fractional question count', { questionCount: 2.5 }, false],
    ['the shortest timer', { secondsPerQuestion: MIN_SECONDS_PER_QUESTION }, true],
    ['a timer below the minimum', { secondsPerQuestion: MIN_SECONDS_PER_QUESTION - 1 }, false],
    ['the longest timer', { secondsPerQuestion: MAX_SECONDS_PER_QUESTION }, true],
    ['a timer above the maximum', { secondsPerQuestion: MAX_SECONDS_PER_QUESTION + 1 }, false],
    ['an unknown setting', { hostBonus: 10 }, false],
  ])('%s', (_label, override, expected) => {
    expect(start(override)).toBe(expected);
  });
});

function manyQuizIds(count: number): string[] {
  return Array.from({ length: count }, (_, n) => `fake-quiz-${String(n)}`);
}

describe('resume tokens', () => {
  const join = (resumeToken: string): boolean =>
    decodeClientMessage(
      JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Ada', resumeToken }),
    ).ok;

  it.each<[string, string, boolean]>([
    ['a well-formed token', RESUME_TOKEN, true],
    ['a token that is too short', 'short', false],
    ['a token with characters outside the URL-safe set', `${RESUME_TOKEN}!/`, false],
    ['a token that is too long', 'a'.repeat(65), false],
  ])('%s', (_label, token, expected) => {
    expect(join(token)).toBe(expected);
  });
});

const regular = (position: number, totalItems: number): Record<string, unknown> => ({
  kind: 'regular',
  position,
  totalItems,
});

describe('question progress and image-group part', () => {
  const sample = SERVER_SAMPLES.find(
    (message) => message.type === 'question' && message.mode === 'type',
  );
  const question = (override: Record<string, unknown>): boolean =>
    decodeServerMessage(JSON.stringify({ ...sample, ...override })).ok;

  it.each<[string, Record<string, unknown>, boolean]>([
    ['the sample question', {}, true],
    ['the last position', { progress: regular(10, 10) }, true],
    ['a position beyond the total', { progress: regular(11, 10) }, false],
    ['position zero', { progress: regular(0, 10) }, false],
    ['the first tie-break question', { progress: { kind: 'tiebreak', round: 1 } }, true],
    [
      'the last tie-break question',
      { progress: { kind: 'tiebreak', round: MAX_TIEBREAK_ROUNDS } },
      true,
    ],
    [
      'a tie-break question past the limit',
      { progress: { kind: 'tiebreak', round: MAX_TIEBREAK_ROUNDS + 1 } },
      false,
    ],
    ['a tie-break question numbered zero', { progress: { kind: 'tiebreak', round: 0 } }, false],
    [
      'a tie-break with a position',
      { progress: { kind: 'tiebreak', round: 1, position: 1 } },
      false,
    ],
    ['an unknown kind of progress', { progress: { kind: 'bonus', round: 1 } }, false],
    ['no progress', { progress: undefined }, false],
    ['the last part', { part: { index: 3, count: 3 } }, true],
    ['a part beyond the part count', { part: { index: 4, count: 3 } }, false],
    ['a group of one part (the real validator only warns)', { part: { index: 1, count: 1 } }, true],
    ['a group of seven parts', { part: { index: 7, count: 7 } }, true],
    ['a part count of zero', { part: { index: 1, count: 0 } }, false],
    ['a part counted from zero', { part: { index: 0, count: 3 } }, false],
    ['a zero duration', { durationMs: 0 }, false],
    [
      'a duration beyond the longest timer',
      { durationMs: MAX_SECONDS_PER_QUESTION * 1_000 + 1 },
      false,
    ],
    ['an unknown mode', { mode: 'self' }, false],
  ])('%s', (_label, override, expected) => {
    expect(question(override)).toBe(expected);
  });
});

describe('reveal and results', () => {
  const reveal = SERVER_SAMPLES.find((message) => message.type === 'reveal');
  const results = SERVER_SAMPLES.find((message) => message.type === 'results');

  it('rejects an unknown outcome', () => {
    const bad = {
      ...reveal,
      results: [{ ...(reveal?.type === 'reveal' ? reveal.results[0] : {}), outcome: 'bonus' }],
    };
    expect(decodeServerMessage(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects negative points', () => {
    const first = reveal?.type === 'reveal' ? reveal.results[0] : undefined;
    const bad = { ...reveal, results: [{ ...first, points: -1 }] };
    expect(decodeServerMessage(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects standings with no players', () => {
    expect(decodeServerMessage(JSON.stringify({ ...results, standings: [] })).ok).toBe(false);
  });

  it('rejects a rank below 1', () => {
    const first = results?.type === 'results' ? results.standings[0] : undefined;
    const bad = { ...results, standings: [{ ...first, rank: 0 }] };
    expect(decodeServerMessage(JSON.stringify(bad)).ok).toBe(false);
  });
});
