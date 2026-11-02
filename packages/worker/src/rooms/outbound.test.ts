import { describe, expect, it } from 'vitest';
import { decodeClientMessage, PROTOCOL_VERSION } from '@quiz-versus/protocol';
import { decodeFailureText } from './outbound.js';

/** The text a player sees for a client message the decoder refuses. */
function textFor(message: unknown): string {
  const decoded = decodeClientMessage(JSON.stringify(message));
  if (decoded.ok) throw new Error('the decoder accepted a message that should be refused');
  return decodeFailureText(decoded.code, decoded.detail);
}

const join = (name: string) => ({ type: 'join', protocolVersion: PROTOCOL_VERSION, name });

describe('decodeFailureText', () => {
  it.each([
    ['an empty name', join('')],
    ['a name of only spaces', join('   ')],
    ['a name that is too long', join('x'.repeat(25))],
    ['a name with a control character', join('Ada\u0007')],
    ['a name with an invisible character', join('Ada​')],
  ])('tells the player what is wrong with %s', (_what, message) => {
    expect(textFor(message)).toMatch(/^Your name must be 1 to 24 characters/);
  });

  it('says what is wrong with the game settings and with a typed answer', () => {
    const settings = { quizIds: ['birds-w1-plumage'], secondsPerQuestion: 20, answerBy: 'pick' };
    expect(textFor({ type: 'start', settings: { ...settings, questionCount: 0 } })).toMatch(
      /^Those game settings are not allowed/,
    );
    const answer = { type: 'answer', itemKey: 'i1', answer: { kind: 'type', text: '' } };
    expect(textFor(answer)).toMatch(/^Your answer must be 1 to 200 characters/);
  });

  it('keeps a general sentence for anything else, and for a message that is too large', () => {
    expect(textFor({ type: 'next', extra: true })).toBe('That message was not understood.');
    expect(textFor(join('x'.repeat(3000)))).toBe('That message was too large.');
  });
});
