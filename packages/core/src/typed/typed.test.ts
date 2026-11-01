import { describe, expect, it } from 'vitest';
import fixtures from '../../test/fixtures/real-app/typed.json';
import { answerForms, answerTooLong } from './answer-forms.js';
import { checkTyped } from './check-typed.js';
import { editDistance, normaliseTyped, sameTyped } from './normalise.js';

describe('parity with the real app (fixtures/real-app/typed.json)', () => {
  it.each(fixtures.typedCases)('answerForms and answerTooLong for "$correct"', (fixture) => {
    expect(answerForms(fixture.correct)).toEqual(fixture.forms);
    expect(answerTooLong(fixture.correct)).toBe(fixture.tooLong);
  });

  const checks = fixtures.typedCases.flatMap((fixture) =>
    fixture.checks.map((check) => ({ correct: fixture.correct, ...check })),
  );
  it.each(checks)('checkTyped("$text") against "$correct"', (fixture) => {
    expect(checkTyped(fixture.text, fixture.correct)).toEqual({
      ok: fixture.ok,
      near: fixture.near,
    });
  });

  it.each(fixtures.normCases)('normaliseTyped("$text")', (fixture) => {
    expect(normaliseTyped(fixture.text)).toBe(fixture.normalised);
  });

  it.each(fixtures.sameCases)('sameTyped("$a", "$b")', (fixture) => {
    expect(sameTyped(fixture.a, fixture.b)).toBe(fixture.same);
  });

  it.each(fixtures.distanceCases)('editDistance("$a", "$b")', (fixture) => {
    expect(editDistance(fixture.a, fixture.b)).toBe(fixture.distance);
  });
});

describe('checkTyped', () => {
  it('never accepts an answer that cannot be checked automatically', () => {
    expect(checkTyped('12 units', '12 units')).toEqual({ ok: false, near: false });
  });

  it('treats an empty or blank entry as wrong, not near', () => {
    expect(checkTyped('   ', 'Zorbulin')).toEqual({ ok: false, near: false });
  });
});
