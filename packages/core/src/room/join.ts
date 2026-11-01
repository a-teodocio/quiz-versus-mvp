import { MAX_PLAYERS_PER_ROOM, PROTOCOL_VERSION } from '@quiz-versus/protocol';
import type { ServerMessage } from '@quiz-versus/protocol';
import { send, toCaller, toEveryone } from './effects.js';
import type { RoomEvent } from './events.js';
import { progressOf, questionMessage, roomMessage } from './messages.js';
import { timeLeft } from './open-question.js';
import { chooseHost, updateSeat } from './seats.js';
import type { RoomState, Seat } from './state.js';
import { reject } from './transition.js';
import type { Transition } from './transition.js';

type JoinEvent = Extract<RoomEvent, { type: 'join' }>;

/** What a player who arrives (or returns) needs to catch up, after `welcome` and `room`. */
function catchUp(room: RoomState, now: number): ServerMessage[] {
  switch (room.phase) {
    case 'lobby':
      return [];
    case 'question':
      return [
        questionMessage(
          room.open.item,
          progressOf(room.game, room.open.cursor),
          timeLeft(room.open, now),
        ),
      ];
    case 'reveal':
      return [room.reveal];
    case 'results':
      return [room.results];
  }
}

/** Takes a seat, or takes a dropped seat back. Returns the seat or the reason it was refused. */
function seatFor(room: RoomState, event: JoinEvent): Seat | Transition {
  if (event.resumeToken !== undefined) {
    const returning = room.seats.find((seat) => seat.resumeToken === event.resumeToken);
    return (
      returning ?? reject(room, 'INVALID_RESUME_TOKEN', 'No seat in this room matches that token.')
    );
  }
  if (room.phase === 'results') return reject(room, 'GAME_OVER', 'This game has finished.');
  if (room.seats.length >= MAX_PLAYERS_PER_ROOM) {
    return reject(room, 'ROOM_FULL', 'This room is full.');
  }
  return {
    id: event.identity.playerId,
    name: event.name,
    resumeToken: event.identity.resumeToken,
    connected: true,
    score: 0,
    correctCount: 0,
    late: room.phase !== 'lobby',
  };
}

const isTransition = (value: Seat | Transition): value is Transition => 'effects' in value;

/**
 * A join: a new seat (late joining is allowed until the results, ADR 6) or a resume with the
 * token. The player gets `welcome`, then everyone gets `room`, then the newcomer is caught up.
 */
export function handleJoin(room: RoomState, event: JoinEvent): Transition {
  const seat = seatFor(room, event);
  if (isTransition(seat)) return seat;
  const known = room.seats.some((existing) => existing.id === seat.id);
  const seats = known
    ? updateSeat(room.seats, seat.id, (existing) => ({ ...existing, connected: true }))
    : [...room.seats, seat];
  const joined: RoomState = { ...room, seats, hostId: chooseHost(seats, room.hostId ?? seat.id) };
  return {
    state: joined,
    effects: [
      send(toCaller, {
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        roomId: room.roomId,
        playerId: seat.id,
        resumeToken: seat.resumeToken,
      }),
      send(toEveryone, roomMessage(joined)),
      ...catchUp(joined, event.now).map((message) => send(toCaller, message)),
    ],
  };
}
