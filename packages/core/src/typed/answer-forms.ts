/**
 * Which correct answers can be typed and checked automatically. A port of `answerForms()` and
 * `answerTooLong()` in the real app's index.html (typed answers, v1.37.0 and v1.42.0). The mock
 * has no self-graded mode (docs/fidelity.md), so an answer these rules reject stays multiple choice.
 */

/** Letters, spaces, hyphens and apostrophes (straight or curly) only. */
const TYPED_CHARS = /^[\p{L}' ’-]+$/u;
const TYPED_MAX_WORDS = 3;
const SINGLE_BRACKET = /^(.*?)\s*\(([^()]*)\)\s*(.*)$/;

/** More than three words is too long to type. Bracketed words do not count. */
export function answerTooLong(correct: string): boolean {
  const bare = correct.replace(/\([^()]*\)/g, ' ').trim();
  const words = bare === '' ? 0 : bare.split(/\s+/).length;
  return words > TYPED_MAX_WORDS;
}

const joinWords = (...parts: readonly string[]): string => parts.filter(Boolean).join(' ');

/** The texts that count as right when the answer has one bracketed part, or null if it is malformed. */
function formsWithOneBracket(text: string): string[] | null {
  const match = SINGLE_BRACKET.exec(text);
  if (match === null) return null;
  const before = match[1] ?? '';
  const inside = match[2] ?? '';
  const after = match[3] ?? '';
  const forms = [joinWords(before, after), joinWords(before, inside, after)];
  // A trailing bracket is a name of its own.
  if (before !== '' && after === '') forms.push(inside);
  return forms;
}

/**
 * Every text that counts as the right answer, or null when the answer cannot be checked
 * automatically (digits, commas, slashes, two or more brackets, or too long). "Alpha (A)" accepts
 * "Alpha", "A" and "Alpha A"; "Loose (areolar) tissue" accepts it with or without the bracket.
 */
export function answerForms(correct: string): string[] | null {
  const text = correct.replace(/\s+/g, ' ').trim();
  const brackets = (text.match(/\(/g) ?? []).length;
  if (brackets > 1) return null;
  const candidates = brackets === 0 ? [text] : formsWithOneBracket(text);
  const forms = candidates?.filter(Boolean);
  if (forms === undefined || forms.length === 0) return null;
  return forms.every((form) => TYPED_CHARS.test(form)) && !answerTooLong(text) ? forms : null;
}
