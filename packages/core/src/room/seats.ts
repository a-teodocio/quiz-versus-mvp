import type { RoomState, Seat } from './state.js';

/** Applies `change` to the seat with this id and leaves the others alone. */
export function updateSeat(
  seats: readonly Seat[],
  id: string,
  change: (seat: Seat) => Seat,
): Seat[] {
  return seats.map((seat) => (seat.id === id ? change(seat) : seat));
}

export const findSeat = (room: RoomState, id: string): Seat | undefined =>
  room.seats.find((seat) => seat.id === id);

export const connectedSeats = (room: RoomState): readonly Seat[] =>
  room.seats.filter((seat) => seat.connected);

/**
 * Who hosts. The host keeps the role while connected; otherwise it passes to the earliest-joined
 * connected player and a returning host does not take it back (ADR 7). With nobody connected the
 * current host stays, and an empty room has none.
 */
export function chooseHost(seats: readonly Seat[], current: string | null): string | null {
  const host = seats.find((seat) => seat.id === current);
  if (host?.connected === true) return host.id;
  const successor = seats.find((seat) => seat.connected);
  return successor?.id ?? host?.id ?? seats[0]?.id ?? null;
}
