import { describe, expect, it } from 'vitest';
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
  InvalidOutgoingMessageError,
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_SERVER_MESSAGE_BYTES,
  PROTOCOL_VERSION,
} from '../src/index.js';
import type { ErrorCode } from '../src/index.js';
import { CLIENT_SAMPLES, SERVER_SAMPLES, SETTINGS } from './samples.js';

const failureOf = (result: ReturnType<typeof decodeClientMessage>): ErrorCode | 'ok' =>
  result.ok ? 'ok' : result.code;

describe('round trip', () => {
  it.each(CLIENT_SAMPLES.map((message) => [message.type, message] as const))(
    'client %s survives encode then decode',
    (_type, message) => {
      const decoded = decodeClientMessage(encodeClientMessage(message));
      expect(decoded).toEqual({ ok: true, message });
    },
  );

  it.each(SERVER_SAMPLES.map((message) => [message.type, message] as const))(
    'server %s survives encode then decode',
    (_type, message) => {
      const decoded = decodeServerMessage(encodeServerMessage(message));
      expect(decoded).toEqual({ ok: true, message });
    },
  );
});

const join = { type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Ada' };

describe('decodeClientMessage rejects a bad envelope:', () => {
  it.each<[string, string, ErrorCode]>([
    ['text that is not JSON', '{nope', 'MALFORMED_MESSAGE'],
    ['an empty string', '', 'MALFORMED_MESSAGE'],
    ['JSON that is not an object', '[1,2]', 'MALFORMED_MESSAGE'],
    ['null', 'null', 'MALFORMED_MESSAGE'],
    ['a missing type', JSON.stringify({ name: 'Ada' }), 'MALFORMED_MESSAGE'],
    ['an unknown type', JSON.stringify({ type: 'cheat' }), 'MALFORMED_MESSAGE'],
    ['an extra key', JSON.stringify({ ...join, isHost: true }), 'MALFORMED_MESSAGE'],
    [
      'a client-supplied player id',
      JSON.stringify({ ...join, playerId: 'x'.repeat(20) }),
      'MALFORMED_MESSAGE',
    ],
    [
      'a different protocol version',
      JSON.stringify({ ...join, protocolVersion: 99 }),
      'UNSUPPORTED_VERSION',
    ],
    [
      'a non-numeric protocol version',
      JSON.stringify({ ...join, protocolVersion: '1' }),
      'MALFORMED_MESSAGE',
    ],
    [
      'a message over the byte limit',
      ' '.repeat(MAX_CLIENT_MESSAGE_BYTES + 1),
      'MESSAGE_TOO_LARGE',
    ],
  ])('%s', (_label, raw, expected) => {
    expect(failureOf(decodeClientMessage(raw))).toBe(expected);
  });
});

describe('decodeClientMessage rejects a bad answer:', () => {
  it.each<[string, string, ErrorCode]>([
    [
      'a pick index of 4',
      JSON.stringify({ type: 'answer', itemKey: 'q', answer: { kind: 'pick', index: 4 } }),
      'MALFORMED_MESSAGE',
    ],
    [
      'a fractional pick index',
      JSON.stringify({ type: 'answer', itemKey: 'q', answer: { kind: 'pick', index: 1.5 } }),
      'MALFORMED_MESSAGE',
    ],
    [
      'an empty typed answer',
      JSON.stringify({ type: 'answer', itemKey: 'q', answer: { kind: 'type', text: '' } }),
      'MALFORMED_MESSAGE',
    ],
    [
      'a typed answer over the limit',
      JSON.stringify({
        type: 'answer',
        itemKey: 'q',
        answer: { kind: 'type', text: 'a'.repeat(201) },
      }),
      'MALFORMED_MESSAGE',
    ],
  ])('%s', (_label, raw, expected) => {
    expect(failureOf(decodeClientMessage(raw))).toBe(expected);
  });
});

describe('decodeClientMessage size and detail', () => {
  it('counts bytes, not characters, against the size limit', () => {
    // 683 three-byte characters are 2049 bytes but only 683 characters.
    const padding = '€'.repeat(Math.floor(MAX_CLIENT_MESSAGE_BYTES / 3) + 1);
    const raw = JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: padding });
    expect(failureOf(decodeClientMessage(raw))).toBe('MESSAGE_TOO_LARGE');
  });

  it('accepts a message exactly at the byte limit', () => {
    const base = JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Ada' });
    const raw = base + ' '.repeat(MAX_CLIENT_MESSAGE_BYTES - base.length);
    expect(failureOf(decodeClientMessage(raw))).toBe('ok');
  });

  it('does not repeat the sender text in the failure detail', () => {
    const result = decodeClientMessage(JSON.stringify({ ...join, secretMarker: 'LEAK-ME' }));
    expect(result.ok ? '' : result.detail).not.toContain('LEAK-ME');
  });
});

describe('decodeServerMessage rejects', () => {
  it('a welcome from a server on another protocol version', () => {
    const raw = JSON.stringify({ ...SERVER_SAMPLES[0], protocolVersion: PROTOCOL_VERSION + 1 });
    const result = decodeServerMessage(raw);
    expect(result.ok ? 'ok' : result.code).toBe('UNSUPPORTED_VERSION');
  });

  it('a message over the byte limit', () => {
    const result = decodeServerMessage(' '.repeat(MAX_SERVER_MESSAGE_BYTES + 1));
    expect(result.ok ? 'ok' : result.code).toBe('MESSAGE_TOO_LARGE');
  });
});

describe('encoding refuses', () => {
  it('a client message that breaks the schema', () => {
    const bad = { type: 'answer', itemKey: '', answer: { kind: 'pick', index: 0 } } as const;
    expect(() => encodeClientMessage(bad)).toThrow(InvalidOutgoingMessageError);
  });

  it('a server message that breaks the schema', () => {
    const bad = { type: 'answerAck', itemKey: '' } as const;
    expect(() => encodeServerMessage(bad)).toThrow(InvalidOutgoingMessageError);
  });
});

describe('failure detail for custom rules', () => {
  const detailOf = (raw: string): string => {
    const result = decodeClientMessage(raw);
    return result.ok ? '' : result.detail;
  };

  it('names the rule with its fixed message', () => {
    const settings = { ...SETTINGS, quizIds: ['fake-quiz', 'fake-quiz'] };
    const detail = detailOf(JSON.stringify({ type: 'start', settings }));
    expect(detail).toContain('quiz ids must be unique');
  });

  it('does not repeat what the sender wrote, even for a custom rule', () => {
    const settings = { ...SETTINGS, quizIds: ['leak-marker', 'leak-marker'] };
    expect(detailOf(JSON.stringify({ type: 'start', settings }))).not.toContain('leak-marker');
  });
});
