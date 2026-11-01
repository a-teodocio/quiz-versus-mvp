import { describe, expect, it } from 'vitest';
import { MIN_PLAYERS_TO_START, decodeServerMessage, encodeServerMessage } from '../src/index.js';

describe('the minimum players to start', () => {
  it('is two, and the refusal travels as an error code', () => {
    expect(MIN_PLAYERS_TO_START).toBe(2);
    const text = encodeServerMessage({
      type: 'error',
      code: 'NOT_ENOUGH_PLAYERS',
      message: 'A versus game needs at least two players.',
    });
    expect(decodeServerMessage(text)).toMatchObject({
      ok: true,
      message: { code: 'NOT_ENOUGH_PLAYERS' },
    });
  });
});
