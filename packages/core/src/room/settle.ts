import type { Effect } from './effects.js';
import { send, toEveryone } from './effects.js';
import { closeQuestion } from './close-question.js';
import { roomMessage } from './messages.js';
import { allAnswered } from './open-question.js';
import type { Rules } from './rules.js';
import type { RoomState } from './state.js';
import type { Transition } from './transition.js';

/**
 * After a change to who is in the room or who has answered: tell everyone how the room looks,
 * and close the question if that change means everyone who can answer has.
 */
export function settle(room: RoomState, rules: Rules, ...before: Effect[]): Transition {
  const announced = [...before, send(toEveryone, roomMessage(room))];
  if (room.phase !== 'question' || !allAnswered(room)) return { state: room, effects: announced };
  const closed = closeQuestion(room, 'all-answered', rules);
  return { state: closed.state, effects: [...announced, ...closed.effects] };
}
