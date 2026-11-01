/** A source of randomness. Production seeds a PRNG; tests feed a fixed sequence. */
export interface Random {
  /** A number in [0, 1), like `Math.random`. */
  next(): number;
}
