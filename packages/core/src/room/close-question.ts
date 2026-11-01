import type { RevealMessage } from '@quiz-versus/protocol';
import type { Item } from '../quiz/item.js';
import { send, toEveryone } from './effects.js';
import { gradeQuestion } from './grade.js';
import { progressOf, roomMessage } from './messages.js';
import type { Rules } from './rules.js';
import type { Game, QuestionRoom, RevealRoom, Seat, Tiebreak } from './state.js';
import { tieAfterRegular, tieAfterRound } from './tiebreak.js';
import type { Transition } from './transition.js';

function correctAnswer(item: Item): RevealMessage['correct'] {
  const text = item.options[item.correctIndex] ?? '';
  return item.mode === 'pick'
    ? { kind: 'pick', index: item.correctIndex, text }
    : { kind: 'type', text, acceptedForms: [...item.acceptedForms] };
}

/** The tie-break to announce at this reveal, if any (ADR 6). */
function tieAtReveal(room: QuestionRoom, seats: readonly Seat[]): Tiebreak | null {
  const { cursor } = room.open;
  const { game } = room;
  if (cursor.kind === 'tiebreak') {
    return game.tiebreak === null
      ? null
      : tieAfterRound(seats, game.tiebreak, game.plan.spare.length);
  }
  const isLast = cursor.index === game.plan.regular.length - 1;
  return isLast ? tieAfterRegular(seats, game.plan.spare.length) : null;
}

/**
 * Closes the open question: grades it, applies the points, and reveals. This is the only place
 * scores and the tie-break change, so a snapshot sent while a question is open leaks nothing.
 */
export function closeQuestion(
  room: QuestionRoom,
  reason: RevealMessage['reason'],
  rules: Rules,
): Transition {
  const { open } = room;
  const progress = progressOf(room.game, open.cursor);
  const graded = gradeQuestion(room, progress, rules);
  const game: Game = { ...room.game, tiebreak: tieAtReveal(room, graded.seats) };
  const reveal: RevealMessage = {
    type: 'reveal',
    itemKey: open.item.key,
    reason,
    correct: correctAnswer(open.item),
    explanation: open.item.explanation,
    results: [...graded.results],
  };
  const revealed: RevealRoom = {
    phase: 'reveal',
    roomId: room.roomId,
    hostId: room.hostId,
    seats: graded.seats,
    game,
    cursor: open.cursor,
    reveal,
  };
  return {
    state: revealed,
    effects: [
      { type: 'clearTimer' },
      send(toEveryone, reveal),
      send(toEveryone, roomMessage(revealed)),
    ],
  };
}
