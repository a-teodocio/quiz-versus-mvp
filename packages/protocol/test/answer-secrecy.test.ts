import { describe, expect, it } from 'vitest';
import { decodeServerMessage, encodeServerMessage } from '../src/index.js';
import type { ServerMessage } from '../src/index.js';
import { SERVER_SAMPLES } from './samples.js';

// Review-checklist B3: nothing sent while a question is open may carry the answer.
const OPEN_QUESTION_SAMPLES = SERVER_SAMPLES.filter(
  (message): message is Extract<ServerMessage, { type: 'question' }> => message.type === 'question',
);

describe('a question never carries the answer', () => {
  it('has samples to check', () => {
    expect(OPEN_QUESTION_SAMPLES.length).toBeGreaterThanOrEqual(2);
  });

  it.each(['correct', 'correctIndex', 'explanation', 'acceptedForms', 'answer'])(
    'decoding rejects a question with an extra "%s" field',
    (field) => {
      for (const question of OPEN_QUESTION_SAMPLES) {
        const result = decodeServerMessage(JSON.stringify({ ...question, [field]: 1 }));
        expect(result.ok).toBe(false);
      }
    },
  );

  it('encoding throws on a question with the answer attached', () => {
    for (const question of OPEN_QUESTION_SAMPLES) {
      const leaky = { ...question, correct: 1 } as unknown as ServerMessage;
      expect(() => encodeServerMessage(leaky)).toThrow();
    }
  });

  it('a typed question cannot carry options', () => {
    const typed = OPEN_QUESTION_SAMPLES.find((question) => question.mode === 'type');
    const leaky = { ...typed, options: ['a', 'b', 'c', 'd'] };
    expect(decodeServerMessage(JSON.stringify(leaky)).ok).toBe(false);
  });

  it('a multiple-choice question needs exactly four options', () => {
    const pick = OPEN_QUESTION_SAMPLES.find((question) => question.mode === 'pick');
    for (const options of [['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e'], undefined]) {
      const raw = JSON.stringify({ ...pick, options });
      expect(decodeServerMessage(raw).ok).toBe(false);
    }
  });
});
