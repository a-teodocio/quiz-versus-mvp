import { describe, expect, it } from 'vitest';
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeServerMessage,
  MAX_EXPLANATION_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_PLAYERS_PER_ROOM,
  MAX_SERVER_MESSAGE_BYTES,
  PLAYER_NAME_MAX_LENGTH,
  PROTOCOL_VERSION,
  TYPED_ANSWER_MAX_LENGTH,
} from '../src/index.js';
import type { ServerMessage } from '../src/index.js';
import { utf8ByteLength } from '../src/codec/utf8-length.js';
import { GUEST_ID, SERVER_SAMPLES } from './samples.js';

const join = (name: unknown): string =>
  JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name });
const accepted = (raw: string): boolean => decodeClientMessage(raw).ok;

describe('player names', () => {
  it.each<[string, string, boolean]>([
    ['one character', 'A', true],
    ['the maximum length', 'a'.repeat(PLAYER_NAME_MAX_LENGTH), true],
    ['one over the maximum', 'a'.repeat(PLAYER_NAME_MAX_LENGTH + 1), false],
    ['empty', '', false],
    ['only spaces', '    ', false],
    ['accents and non-Latin letters', 'Zoë 李雷', true],
    ['an emoji counted as one character', '🙂'.repeat(PLAYER_NAME_MAX_LENGTH), true],
    ['too many emoji', '🙂'.repeat(PLAYER_NAME_MAX_LENGTH + 1), false],
    ['a newline', 'Ada\nLovelace', false],
    ['a right-to-left override', 'Ada‮evil', false],
    ['a zero-width space', 'A​da', false],
    ['HTML, which is data and not markup', '<b>Ada</b>', true],
  ])('%s', (_label, name, expected) => {
    expect(accepted(join(name))).toBe(expected);
  });

  it('trims surrounding spaces', () => {
    const result = decodeClientMessage(join('  Ada  '));
    expect(result.ok && result.message.type === 'join' ? result.message.name : null).toBe('Ada');
  });

  it('rejects a name that is not a string', () => {
    expect(accepted(join(42))).toBe(false);
    expect(accepted(join(null))).toBe(false);
  });
});

describe('typed answers', () => {
  const typed = (text: string): string =>
    JSON.stringify({ type: 'answer', itemKey: 'q', answer: { kind: 'type', text } });

  it('accepts the maximum length and unicode', () => {
    expect(accepted(typed('é'.repeat(TYPED_ANSWER_MAX_LENGTH)))).toBe(true);
  });

  it('keeps spacing exactly, because the checker normalises it', () => {
    const result = decodeClientMessage(typed('  the  cell '));
    const text =
      result.ok && result.message.type === 'answer' && result.message.answer.kind === 'type'
        ? result.message.answer.text
        : null;
    expect(text).toBe('  the  cell ');
  });
});

describe('room limits', () => {
  const room = SERVER_SAMPLES.find((message) => message.type === 'room');

  it('accepts a full room and rejects one more player', () => {
    if (room?.type !== 'room') throw new Error('missing room sample');
    const player = (n: number): (typeof room.room.players)[number] => ({
      id: `player_${String(n).padStart(2, '0')}_AAAAAAAAAAAAAAA`,
      name: `P${String(n)}`,
      connected: true,
      answered: false,
      score: 0,
    });
    const make = (count: number): ServerMessage => ({
      type: 'room',
      room: { ...room.room, players: Array.from({ length: count }, (_, n) => player(n)) },
    });
    expect(decodeServerMessage(encodeServerMessage(make(MAX_PLAYERS_PER_ROOM))).ok).toBe(true);
    expect(decodeServerMessage(JSON.stringify(make(MAX_PLAYERS_PER_ROOM + 1))).ok).toBe(false);
  });

  it('rejects a room with no players', () => {
    if (room?.type !== 'room') throw new Error('missing room sample');
    expect(
      decodeServerMessage(JSON.stringify({ ...room, room: { ...room.room, players: [] } })).ok,
    ).toBe(false);
  });
});

describe('image paths', () => {
  const question = SERVER_SAMPLES.find(
    (message) => message.type === 'question' && message.mode === 'type',
  );
  const withImage = (imageUrl: string): boolean =>
    decodeServerMessage(JSON.stringify({ ...question, imageUrl })).ok;

  it.each<[string, string, boolean]>([
    ['a same-origin path', '/images/fake/a.png', true],
    ['a protocol-relative URL', '//evil.example/a.png', false],
    ['an absolute URL', 'https://evil.example/a.png', false],
    ['a javascript URL', 'javascript:alert(1)', false],
    ['a path with a space', '/images/a b.png', false],
    ['a relative path', 'images/a.png', false],
  ])('%s', (_label, url, expected) => {
    expect(withImage(url)).toBe(expected);
  });
});

describe('worst-case size', () => {
  it('a reveal with every text at its maximum still fits the server limit', () => {
    const longest = 'é'.repeat(MAX_OPTION_LENGTH);
    const reveal: ServerMessage = {
      type: 'reveal',
      itemKey: 'k'.repeat(128),
      reason: 'timeout',
      correct: { kind: 'type', text: longest, acceptedForms: [longest, longest, longest, longest] },
      explanation: '€'.repeat(MAX_EXPLANATION_LENGTH),
      results: Array.from({ length: MAX_PLAYERS_PER_ROOM }, () => ({
        playerId: GUEST_ID,
        outcome: 'wrong' as const,
        near: false,
        points: 0,
        score: 1_000_000,
        answer: { kind: 'type' as const, text: '€'.repeat(TYPED_ANSWER_MAX_LENGTH) },
      })),
    };
    const text = encodeServerMessage(reveal);
    expect(utf8ByteLength(text)).toBeLessThan(MAX_SERVER_MESSAGE_BYTES);
  });
});
