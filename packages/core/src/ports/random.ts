/**
 * A source of randomness. Production must be unpredictable (backed by `crypto.getRandomValues`),
 * not a small-state seeded PRNG: the same stream fixes the secret option order and the public
 * image names, and a client that could recover a weak generator's state could predict later
 * answers. Tests feed a fixed or seeded sequence.
 */
export interface Random {
  /** A number in [0, 1), like `Math.random`. */
  next(): number;
}
