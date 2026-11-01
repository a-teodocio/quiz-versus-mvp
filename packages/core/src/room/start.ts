import { MIN_PLAYERS_TO_START } from '@quiz-versus/protocol';
import type { RoomEvent } from './events.js';
import { openQuestion } from './open-question.js';
import type { Game, RoomState } from './state.js';
import { reject } from './transition.js';
import type { Transition } from './transition.js';

type StartEvent = Extract<RoomEvent, { type: 'start' }>;

/** The host starts the game from the lobby with a plan the adapter prepared (ADR 7). */
export function handleStart(room: RoomState, event: StartEvent): Transition {
  if (room.hostId !== event.playerId) {
    return reject(room, 'NOT_HOST', 'Only the host can start the game.');
  }
  if (room.phase !== 'lobby') return reject(room, 'WRONG_PHASE', 'The game has already started.');
  if (room.seats.filter((seat) => seat.connected).length < MIN_PLAYERS_TO_START) {
    return reject(room, 'NOT_ENOUGH_PLAYERS', 'A versus game needs at least two players.');
  }
  const { plan, settings } = event;
  if (plan.regular.length !== settings.questionCount) {
    return reject(room, 'INVALID_SETTINGS', 'The prepared game does not match the settings.');
  }
  const game: Game = { settings, plan, tiebreak: null };
  return openQuestion(room, game, { kind: 'regular', index: 0 }, event.now);
}
