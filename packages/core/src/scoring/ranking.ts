/** A player as the ranking sees them. */
export interface Scored {
  readonly id: string;
  readonly score: number;
}

/**
 * Standard competition ranking: equal scores share a rank and the next rank skips ahead, so scores
 * 9, 7, 7, 5 rank 1, 2, 2, 4 (ADR 6). The order of equal scores is the order given.
 */
export function rankPlayers<T extends Scored>(
  players: readonly T[],
): readonly { readonly player: T; readonly rank: number }[] {
  const ordered = [...players].sort((a, b) => b.score - a.score);
  return ordered.map((player) => ({
    player,
    rank: 1 + ordered.filter((other) => other.score > player.score).length,
  }));
}
