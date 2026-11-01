import type { RoomEvent } from './events.js';
import { finishGame } from './finish-game.js';
import type { Rules } from './rules.js';
import { chooseHost, findSeat, updateSeat } from './seats.js';
import { settle } from './settle.js';
import { createRoom } from './state.js';
import type { Game, RoomState } from './state.js';
import { stay } from './transition.js';
import type { Transition } from './transition.js';

type LeaveEvent = Extract<RoomEvent, { type: 'leave' }>;
type DisconnectEvent = Extract<RoomEvent, { type: 'disconnect' }>;

/** A dropped connection: the seat stays, shown as not connected, and may be resumed. */
export function handleDisconnect(
  room: RoomState,
  event: DisconnectEvent,
  rules: Rules,
): Transition {
  if (findSeat(room, event.playerId) === undefined) return stay(room);
  const seats = updateSeat(room.seats, event.playerId, (seat) => ({ ...seat, connected: false }));
  return settle({ ...room, seats, hostId: chooseHost(seats, room.hostId) }, rules);
}

/** The game with this player taken out of the tie-break. `collapsed` when fewer than 2 remain. */
function leaveTie(game: Game, playerId: string): { game: Game; collapsed: boolean } {
  const { tiebreak } = game;
  if (tiebreak?.playerIds.includes(playerId) !== true) return { game, collapsed: false };
  const playerIds = tiebreak.playerIds.filter((id) => id !== playerId);
  if (playerIds.length < 2) return { game: { ...game, tiebreak: null }, collapsed: true };
  return { game: { ...game, tiebreak: { ...tiebreak, playerIds } }, collapsed: false };
}

interface Removal {
  readonly room: RoomState;
  /** The tie-break lost too many players to go on. */
  readonly tieCollapsed: boolean;
}

function removeSeat(room: RoomState, playerId: string): Removal {
  const seats = room.seats.filter((seat) => seat.id !== playerId);
  const hostId = chooseHost(seats, room.hostId);
  switch (room.phase) {
    case 'lobby':
    case 'results':
      return { room: { ...room, seats, hostId }, tieCollapsed: false };
    case 'reveal': {
      const { game } = leaveTie(room.game, playerId);
      return { room: { ...room, seats, hostId, game }, tieCollapsed: false };
    }
    case 'question': {
      const { game, collapsed } = leaveTie(room.game, playerId);
      const answers = room.open.answers.filter((entry) => entry.playerId !== playerId);
      return {
        room: { ...room, seats, hostId, game, open: { ...room.open, answers } },
        tieCollapsed: collapsed,
      };
    }
  }
}

/**
 * A player gives up their seat for good. If a tie-break is left with fewer than two players it
 * ends and the game goes straight to the results; an empty room is closed.
 */
export function handleLeave(room: RoomState, event: LeaveEvent, rules: Rules): Transition {
  if (findSeat(room, event.playerId) === undefined) return stay(room);
  const { room: left, tieCollapsed } = removeSeat(room, event.playerId);
  // A closed room goes back to an empty lobby, so a late alarm or join finds nothing to break.
  if (left.seats.length === 0) {
    return stay(createRoom(left.roomId), { type: 'clearTimer' }, { type: 'closeRoom' });
  }
  if (tieCollapsed && left.phase === 'question') return finishGame(left, left.game);
  return settle(left, rules);
}
