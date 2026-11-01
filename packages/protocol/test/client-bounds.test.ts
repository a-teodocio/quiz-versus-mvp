import { describe, expect, it } from 'vitest';
import {
  decodeClientMessage,
  MAX_ITEM_KEY_LENGTH,
  MAX_QUIZ_ID_LENGTH,
  PROTOCOL_VERSION,
} from '../src/index.js';
import { SETTINGS } from './samples.js';

const accepted = (value: unknown): boolean => decodeClientMessage(JSON.stringify(value)).ok;
const answerWithKey = (itemKey: unknown): boolean =>
  accepted({ type: 'answer', itemKey, answer: { kind: 'pick', index: 0 } });
const startWithQuiz = (quizId: unknown): boolean =>
  accepted({ type: 'start', settings: { ...SETTINGS, quizIds: [quizId] } });
const joinWithVersion = (protocolVersion: unknown): boolean =>
  accepted({ type: 'join', protocolVersion, name: 'Ada' });

describe('item keys in an answer', () => {
  it.each<[string, unknown, boolean]>([
    ['one character', 'q', true],
    ['the maximum length', 'k'.repeat(MAX_ITEM_KEY_LENGTH), true],
    ['one over the maximum', 'k'.repeat(MAX_ITEM_KEY_LENGTH + 1), false],
    ['empty', '', false],
    ['a number', 7, false],
    ['null', null, false],
  ])('%s', (_label, key, expected) => {
    expect(answerWithKey(key)).toBe(expected);
  });
});

describe('quiz ids in the start settings', () => {
  it.each<[string, unknown, boolean]>([
    ['the maximum length', 'a'.repeat(MAX_QUIZ_ID_LENGTH), true],
    ['one over the maximum', 'a'.repeat(MAX_QUIZ_ID_LENGTH + 1), false],
    ['empty', '', false],
    ['a trailing hyphen', 'fake-quiz-', false],
    ['a leading hyphen', '-fake-quiz', false],
    ['a double hyphen', 'fake--quiz', false],
    ['an underscore', 'fake_quiz', false],
    ['a number', 7, false],
  ])('%s', (_label, id, expected) => {
    expect(startWithQuiz(id)).toBe(expected);
  });
});

describe('protocol version in a join', () => {
  it.each<[string, unknown]>([
    ['a fractional number', 1.5],
    ['null', null],
    ['a string', '1'],
    ['missing', undefined],
  ])('rejects %s', (_label, version) => {
    expect(joinWithVersion(version)).toBe(false);
  });

  it('accepts the current version', () => {
    expect(joinWithVersion(PROTOCOL_VERSION)).toBe(true);
  });
});

describe('keys that could poison an object', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('rejects an extra "%s" key', (key) => {
    // JSON.parse creates own properties with these names, so the text is written by hand.
    const raw = `{"type":"leave","${key}":{"isHost":true}}`;
    expect(decodeClientMessage(raw).ok).toBe(false);
  });
});
