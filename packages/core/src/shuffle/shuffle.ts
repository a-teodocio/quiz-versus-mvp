import type { Random } from '../ports/random.js';

/**
 * Fisher-Yates shuffle, written exactly as the real app writes it (`shuffle()` in index.html):
 * walk from the end and swap with `floor(r * (i + 1))`. Only the source of `r` differs, so a
 * fixed `Random` reproduces a known order. Returns a new array.
 */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  // Both indexes are in range by construction; the casts only satisfy noUncheckedIndexedAccess.
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    const held = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = held;
  }
  return copy;
}

/** Options in their shuffled order, and where the correct one ended up. */
export interface ShuffledOptions {
  readonly options: readonly string[];
  readonly correctIndex: number;
}

/**
 * Shuffles the options and finds the correct one again by its text, as the real app does
 * (`shuffledOptions.indexOf(options[correct])`). When two options have the same text the first
 * match wins; that quirk is part of parity and is pinned by a fixture.
 */
export function shuffleOptions(
  options: readonly string[],
  correct: number,
  random: Random,
): ShuffledOptions {
  const shuffled = shuffle(options, random);
  const correctText = options[correct];
  return {
    options: shuffled,
    correctIndex: correctText === undefined ? -1 : shuffled.indexOf(correctText),
  };
}
