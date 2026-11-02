/**
 * Text helpers ported from the real validator. Python's `\w` knows every language's letters and
 * digits, but JavaScript's `\w` and `\b` are ASCII only, so a word character here is spelled out
 * as a Unicode class. Without that, accented text would be split and cut differently.
 */

/** A letter, a digit in any script, or an underscore: Python's `\w`. */
export const WORD_CHARACTER = '[\\p{L}\\p{N}_]';

const WORD_CHARACTER_RX = new RegExp(WORD_CHARACTER, 'u');
const NOT_WORD_OR_SPACE_OR_SLASH_OR_HYPHEN = /[^\p{L}\p{N}_\s/-]/gu;

/** Lower case, punctuation (except `/` and `-`) turned into spaces, runs of spaces made one. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(NOT_WORD_OR_SPACE_OR_SLASH_OR_HYPHEN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isWordCharacter = (character: string | undefined): boolean =>
  character !== undefined && WORD_CHARACTER_RX.test(character);

/** Whether `needle` appears in `haystack` as whole words (not inside a longer word). */
export function containsPhrase(haystack: string, needle: string): boolean {
  if (needle === '') return false;
  let from = haystack.indexOf(needle);
  while (from >= 0) {
    const before = Array.from(haystack.slice(0, from)).pop();
    const after = Array.from(haystack.slice(from + needle.length))[0];
    if (!isWordCharacter(before) && !isWordCharacter(after)) return true;
    from = haystack.indexOf(needle, from + 1);
  }
  return false;
}

/** Sentences, split where . ! or ? is followed by a space and a capital, digit, quote or bracket. */
export function countSentences(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/)
    .filter((part) => part !== '').length;
}

/** The text with every regular-expression special character escaped. */
export const escapeForRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
