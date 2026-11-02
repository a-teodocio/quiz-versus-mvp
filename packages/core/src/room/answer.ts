import type { ErrorCode } from '@quiz-versus/protocol';
import { closeQuestion } from './close-question.js';
import { refuse, send, toCaller } from './effects.js';
import type { RoomEvent } from './events.js';
import { askedIds } from './open-question.js';
import type { Rules } from './rules.js';
import { settle } from './settle.js';
import type { QuestionRoom, RoomState } from './state.js';
import { reject } from './transition.js';
import type { Transition } from './transition.js';

type AnswerEvent = Extract<RoomEvent, { type: 'answer' }>;

/** The first rule the answer breaks, as an error code and text, or null if it is acceptable. */
function problemWith(room: QuestionRoom, event: AnswerEvent): [ErrorCode, string] | null {
  const { open } = room;
  if (event.itemKey !== open.item.key) return ['STALE_QUESTION', 'That is not the open question.'];
  if (!askedIds(room).includes(event.playerId)) {
    return [
      'NOT_IN_TIEBREAK',
      'Only the players tied for first place answer this question. You are watching.',
    ];
  }
  if (open.answers.some((entry) => entry.playerId === event.playerId)) {
    return ['ALREADY_ANSWERED', 'You have already answered this question.'];
  }
  if (event.answer.kind !== open.item.mode) {
    return ['INVALID_ANSWER', 'That kind of answer does not fit this question.'];
  }
  return null;
}

function answerOpenQuestion(room: QuestionRoom, event: AnswerEvent, rules: Rules): Transition {
  if (event.now >= room.open.deadline) {
    // The timer is overdue: close the question first, then refuse the late answer.
    const closed = closeQuestion(room, 'timeout', rules);
    return {
      state: closed.state,
      effects: [
        refuse('STALE_QUESTION', 'The time for that question has run out.'),
        ...closed.effects,
      ],
    };
  }
  const problem = problemWith(room, event);
  if (problem !== null) return reject(room, ...problem);
  const accepted: QuestionRoom = {
    ...room,
    open: {
      ...room.open,
      answers: [...room.open.answers, { playerId: event.playerId, answer: event.answer }],
    },
  };
  return settle(accepted, rules, send(toCaller, { type: 'answerAck', itemKey: event.itemKey }));
}

/** An answer to the open question. Held, not graded, until the question closes. */
export function handleAnswer(room: RoomState, event: AnswerEvent, rules: Rules): Transition {
  if (!room.seats.some((seat) => seat.id === event.playerId)) {
    return reject(room, 'NOT_JOINED', 'Join the room first.');
  }
  if (room.phase === 'reveal')
    return reject(
      room,
      'STALE_QUESTION',
      'That question has closed, so your answer came too late.',
    );
  if (room.phase !== 'question') return reject(room, 'WRONG_PHASE', 'No question is open.');
  return answerOpenQuestion(room, event, rules);
}
