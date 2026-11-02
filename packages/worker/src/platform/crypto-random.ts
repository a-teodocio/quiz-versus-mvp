import { getRandomValues } from 'node:crypto';
import type { Random } from '@quiz-versus/core';

const TWO_POW_32 = 2 ** 32;
const TWO_POW_53 = 2 ** 53;
/** Drops 11 of the first word's 32 bits, leaving 21; with the second word that is 53. */
const SHIFT_TO_21_BITS = 11;

/**
 * A number in [0, 1) with 53 random bits (the precision of a double), from the operating
 * system's secure source. The same stream decides the secret option order and the public image
 * names, so it must not be a seeded generator whose state a client could recover (ADR 7).
 */
export const cryptoRandom: Random = {
  next() {
    const [high = 0, low = 0] = getRandomValues(new Uint32Array(2));
    return ((high >>> SHIFT_TO_21_BITS) * TWO_POW_32 + low) / TWO_POW_53;
  },
};
