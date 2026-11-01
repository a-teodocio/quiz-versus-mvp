import { answerForms } from './answer-forms.js';
import { editDistance, normaliseTyped, sameTyped } from './normalise.js';

/** What checking a typed answer found. */
export interface TypedCheck {
  /** The answer is right. */
  readonly ok: boolean;
  /** Wrong by a letter or two (a spelling slip). Still wrong, as in the real app. */
  readonly near: boolean;
}

/**
 * Checks typed text against the correct option's text; a port of `checkTyped()` in the real app.
 * An answer that cannot be checked automatically, or an empty entry, is never right.
 */
export function checkTyped(typed: string, correct: string): TypedCheck {
  const forms = answerForms(correct);
  const entry = normaliseTyped(typed);
  if (forms === null || entry === '') return { ok: false, near: false };
  const accepted = forms.map(normaliseTyped);
  if (accepted.some((form) => sameTyped(entry, form))) return { ok: true, near: false };
  const closest = accepted.reduce(
    (best, form) => {
      const distance = editDistance(entry, form);
      return distance < best.distance ? { distance, length: form.length } : best;
    },
    { distance: Infinity, length: 0 },
  );
  return {
    ok: false,
    near: closest.distance <= 2 && closest.distance < Math.ceil(closest.length / 2),
  };
}
