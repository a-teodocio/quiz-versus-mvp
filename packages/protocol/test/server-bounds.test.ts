import { describe, expect, it } from 'vitest';
import {
  decodeServerMessage,
  encodeServerMessage,
  MAX_ACCEPTED_FORMS,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_EXPLANATION_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_PLAYERS_PER_ROOM,
  MAX_PROMPT_LENGTH,
  MAX_SERVER_MESSAGE_BYTES,
  OPTION_COUNT,
  TYPED_ANSWER_MAX_LENGTH,
} from '../src/index.js';
import type { ServerMessage } from '../src/index.js';
import { utf8ByteLength } from '../src/codec/utf8-length.js';
import { GUEST_ID, SERVER_SAMPLES } from './samples.js';

type Sample<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

function sampleOf<T extends ServerMessage['type']>(type: T): Sample<T> {
  const found = SERVER_SAMPLES.find((message): message is Sample<T> => message.type === type);
  if (found === undefined) throw new Error(`no sample of type ${type}`);
  return found;
}

function questionSample(mode: 'pick' | 'type'): Sample<'question'> {
  const found = SERVER_SAMPLES.find(
    (message): message is Sample<'question'> =>
      message.type === 'question' && message.mode === mode,
  );
  if (found === undefined) throw new Error(`no ${mode} question sample`);
  return found;
}

const decodes = (value: unknown): boolean => decodeServerMessage(JSON.stringify(value)).ok;
const repeated = (text: string, times: number): string[] =>
  Array.from({ length: times }, () => text);

describe('error messages', () => {
  const error = sampleOf('error');

  it.each<[string, Record<string, unknown>, boolean]>([
    ['the sample', {}, true],
    ['an unknown code', { code: 'TEAPOT' }, false],
    ['an empty message', { message: '' }, false],
    ['the longest message', { message: 'm'.repeat(MAX_ERROR_MESSAGE_LENGTH) }, true],
    ['a message one too long', { message: 'm'.repeat(MAX_ERROR_MESSAGE_LENGTH + 1) }, false],
  ])('%s', (_label, override, expected) => {
    expect(decodes({ ...error, ...override })).toBe(expected);
  });
});

describe('reveal bounds', () => {
  const reveal = sampleOf('reveal');
  const first = reveal.results[0];
  const manyResults = (count: number): unknown[] => Array.from({ length: count }, () => first);

  it.each<[string, Record<string, unknown>, boolean]>([
    ['no results', { results: [] }, false],
    ['a full room of results', { results: manyResults(MAX_PLAYERS_PER_ROOM) }, true],
    ['one result too many', { results: manyResults(MAX_PLAYERS_PER_ROOM + 1) }, false],
    ['an empty explanation', { explanation: '' }, false],
    ['the longest explanation', { explanation: 'e'.repeat(MAX_EXPLANATION_LENGTH) }, true],
    ['an explanation one too long', { explanation: 'e'.repeat(MAX_EXPLANATION_LENGTH + 1) }, false],
    ['an unknown reason', { reason: 'host-skipped' }, false],
  ])('%s', (_label, override, expected) => {
    expect(decodes({ ...reveal, ...override })).toBe(expected);
  });

  it.each<[string, string[], boolean]>([
    ['no accepted forms', [], false],
    ['the most accepted forms', repeated('Form', MAX_ACCEPTED_FORMS), true],
    ['one accepted form too many', repeated('Form', MAX_ACCEPTED_FORMS + 1), false],
    ['an empty accepted form', [''], false],
    ['an accepted form that is too long', ['f'.repeat(MAX_OPTION_LENGTH + 1)], false],
  ])('a typed answer with %s', (_label, acceptedForms, expected) => {
    const correct = { kind: 'type', text: 'Form', acceptedForms };
    expect(decodes({ ...reveal, correct })).toBe(expected);
  });
});

describe('question bounds', () => {
  it.each<['pick' | 'type']>([['pick'], ['type']])(
    'a %s question: a position beyond the total is refused',
    (mode) => {
      const sample = questionSample(mode);
      const progress = (position: number): unknown => ({
        kind: 'regular',
        position,
        totalItems: 10,
      });
      expect(decodes({ ...sample, progress: progress(11) })).toBe(false);
      expect(decodes({ ...sample, progress: progress(10) })).toBe(true);
    },
  );

  it.each<[string, Record<string, unknown>, boolean]>([
    ['an empty prompt', { prompt: '' }, false],
    ['the longest prompt', { prompt: 'p'.repeat(MAX_PROMPT_LENGTH) }, true],
    ['a prompt one too long', { prompt: 'p'.repeat(MAX_PROMPT_LENGTH + 1) }, false],
    ['an empty option', { options: ['a', '', 'c', 'd'] }, false],
    [
      'the longest options',
      { options: repeated('o'.repeat(MAX_OPTION_LENGTH), OPTION_COUNT) },
      true,
    ],
    [
      'an option one too long',
      { options: ['a', 'b', 'c', 'o'.repeat(MAX_OPTION_LENGTH + 1)] },
      false,
    ],
  ])('a multiple-choice question with %s', (_label, override, expected) => {
    expect(decodes({ ...questionSample('pick'), ...override })).toBe(expected);
  });
});

describe('worst-case size', () => {
  // JSON writes a control character as six bytes (\u0001), the most any one character can cost.
  const costly = (length: number): string => '\u0001'.repeat(length);

  it('a reveal with every text at its maximum still fits the server limit', () => {
    const reveal: ServerMessage = {
      type: 'reveal',
      itemKey: 'k'.repeat(128),
      reason: 'timeout',
      correct: {
        kind: 'type',
        text: costly(MAX_OPTION_LENGTH),
        acceptedForms: repeated(costly(MAX_OPTION_LENGTH), MAX_ACCEPTED_FORMS),
      },
      explanation: costly(MAX_EXPLANATION_LENGTH),
      results: Array.from({ length: MAX_PLAYERS_PER_ROOM }, () => ({
        playerId: GUEST_ID,
        outcome: 'wrong' as const,
        near: false,
        points: 0,
        score: 1_000_000,
        answer: { kind: 'type' as const, text: costly(TYPED_ANSWER_MAX_LENGTH) },
      })),
    };
    expect(utf8ByteLength(encodeServerMessage(reveal))).toBeLessThan(MAX_SERVER_MESSAGE_BYTES);
  });

  it('a question with every text at its maximum still fits the server limit', () => {
    const question: ServerMessage = {
      type: 'question',
      mode: 'pick',
      progress: { kind: 'regular', position: 100, totalItems: 100 },
      itemKey: 'k'.repeat(128),
      prompt: costly(MAX_PROMPT_LENGTH),
      options: repeated(costly(MAX_OPTION_LENGTH), OPTION_COUNT),
      durationMs: 120_000,
    };
    expect(utf8ByteLength(encodeServerMessage(question))).toBeLessThan(MAX_SERVER_MESSAGE_BYTES);
  });
});
