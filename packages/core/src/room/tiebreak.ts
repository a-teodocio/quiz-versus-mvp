import { MAX_TIEBREAK_ROUNDS } from '@quiz-versus/protocol';
import type { Seat, Tiebreak } from './state.js';

const topScore = (seats: readonly Seat[]): number =>
  seats.reduce((best, seat) => Math.max(best, seat.score), 0);

/**
 * The tie for first place after the last regular question, or null when there is none to play.
 * Late joiners never play a tie-break, and with no spare question the leaders simply share rank 1
 * (ADR 6). `spareCount` is how many reserve questions the plan has.
 */
export function tieAfterRegular(seats: readonly Seat[], spareCount: number): Tiebreak | null {
  const top = topScore(seats);
  const leaders = seats.filter((seat) => seat.score === top);
  const tied = leaders.filter((seat) => !seat.late);
  if (leaders.length < 2 || tied.length < 2 || spareCount < 1) return null;
  return { round: 1, playerIds: tied.map((seat) => seat.id) };
}

/**
 * The tie after a tie-break question: the players still level at the top stay in. It ends (null)
 * when one player leads, after MAX_TIEBREAK_ROUNDS, or when no spare question is left; the
 * players still level are then co-winners.
 */
export function tieAfterRound(
  seats: readonly Seat[],
  current: Tiebreak,
  spareCount: number,
): Tiebreak | null {
  const members = seats.filter((seat) => current.playerIds.includes(seat.id));
  const top = topScore(members);
  const level = members.filter((seat) => seat.score === top);
  const roomForAnother = current.round < MAX_TIEBREAK_ROUNDS && spareCount > current.round;
  if (level.length < 2 || !roomForAnother) return null;
  return { round: current.round + 1, playerIds: level.map((seat) => seat.id) };
}
