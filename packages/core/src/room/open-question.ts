import type { Item } from '../quiz/item.js';
import { progressOf, questionMessage, roomMessage } from './messages.js';
import { send, toEveryone } from './effects.js';
import type { Cursor, Game, QuestionRoom, RoomState } from './state.js';
import type { Transition } from './transition.js';

const MS_PER_SECOND = 1_000;
/** The protocol never sends a question with no time left, however late the alarm. */
const MIN_TIME_LEFT_MS = 1;

const durationOf = (game: Game): number => game.settings.secondsPerQuestion * MS_PER_SECOND;

/** The item a cursor points at: a regular question, or the spare question for a tie-break round. */
export function itemAt(game: Game, cursor: Cursor): Item {
  const item =
    cursor.kind === 'regular' ? game.plan.regular[cursor.index] : game.plan.spare[cursor.round - 1];
  if (item === undefined) throw new Error('The game plan has no item for this position.');
  return item;
}

/** Opens a question: starts its timer and tells everyone. Everyone sees it, watchers included. */
export function openQuestion(room: RoomState, game: Game, cursor: Cursor, now: number): Transition {
  const item = itemAt(game, cursor);
  const deadline = now + durationOf(game);
  const opened: QuestionRoom = {
    phase: 'question',
    roomId: room.roomId,
    hostId: room.hostId,
    seats: room.seats,
    game,
    open: { cursor, item, deadline, answers: [] },
  };
  const question = questionMessage(item, progressOf(game, cursor), durationOf(game));
  return {
    state: opened,
    effects: [
      { type: 'setTimer', at: deadline },
      send(toEveryone, question),
      send(toEveryone, roomMessage(opened)),
    ],
  };
}

/** Time left on the open question, never less than 1 ms (the question is open, so it is positive). */
export const timeLeft = (open: QuestionRoom['open'], now: number): number =>
  Math.max(MIN_TIME_LEFT_MS, open.deadline - now);

/** The players who may answer: everyone, or in a tie-break only the tied players. */
export function askedIds(room: QuestionRoom): readonly string[] {
  const { tiebreak } = room.game;
  if (room.open.cursor.kind === 'tiebreak' && tiebreak !== null) return tiebreak.playerIds;
  return room.seats.map((seat) => seat.id);
}

/**
 * True when every connected player who may answer has. With nobody connected who may answer, the
 * question waits for its timeout, so tie-break rounds cannot burn while players are away.
 */
export function allAnswered(room: QuestionRoom): boolean {
  const asked = askedIds(room);
  const waiting = room.seats.filter((seat) => seat.connected && asked.includes(seat.id));
  const answered = new Set(room.open.answers.map((entry) => entry.playerId));
  return waiting.length > 0 && waiting.every((seat) => answered.has(seat.id));
}
