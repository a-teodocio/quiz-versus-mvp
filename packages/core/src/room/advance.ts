import type { RoomEvent } from './events.js';
import { finishGame } from './finish-game.js';
import { openQuestion } from './open-question.js';
import type { Cursor, RevealRoom, RoomState } from './state.js';
import { reject } from './transition.js';
import type { Transition } from './transition.js';

type NextEvent = Extract<RoomEvent, { type: 'next' }>;

/** The next question to ask, or null when the game is over. A tie announced at the reveal comes first. */
function cursorAfter(room: RevealRoom): Cursor | null {
  const { tiebreak, plan } = room.game;
  if (tiebreak !== null) return { kind: 'tiebreak', round: tiebreak.round };
  if (room.cursor.kind === 'regular' && room.cursor.index + 1 < plan.regular.length) {
    return { kind: 'regular', index: room.cursor.index + 1 };
  }
  return null;
}

/** The host moves on from a reveal: the next question, a tie-break, or the results. */
export function handleNext(room: RoomState, event: NextEvent): Transition {
  if (room.hostId !== event.playerId) {
    return reject(room, 'NOT_HOST', 'Only the host can move on.');
  }
  if (room.phase !== 'reveal') {
    return reject(room, 'WRONG_PHASE', 'There is no reveal to move on from.');
  }
  const cursor = cursorAfter(room);
  return cursor === null
    ? finishGame(room, room.game)
    : openQuestion(room, room.game, cursor, event.now);
}
