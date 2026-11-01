import { handleNext } from './advance.js';
import { handleAnswer } from './answer.js';
import { closeQuestion } from './close-question.js';
import { handleDisconnect, handleLeave } from './departure.js';
import type { RoomEvent } from './events.js';
import { handleJoin } from './join.js';
import { defaultRules } from './rules.js';
import type { Rules } from './rules.js';
import { handleStart } from './start.js';
import type { RoomState } from './state.js';
import { stay } from './transition.js';
import type { Transition } from './transition.js';

/** The timer fired. A stale alarm (the question already closed, or not yet due) changes nothing. */
function handleTimer(room: RoomState, now: number, rules: Rules): Transition {
  if (room.phase !== 'question' || now < room.open.deadline) return stay(room);
  return closeQuestion(room, 'timeout', rules);
}

/**
 * The room state machine: a pure function of state and event that returns the new state and the
 * effects to carry out. No clock, randomness or network is touched here (ADR 7).
 */
export function step(state: RoomState, event: RoomEvent, rules: Rules = defaultRules): Transition {
  switch (event.type) {
    case 'join':
      return handleJoin(state, event);
    case 'start':
      return handleStart(state, event);
    case 'answer':
      return handleAnswer(state, event, rules);
    case 'next':
      return handleNext(state, event);
    case 'leave':
      return handleLeave(state, event, rules);
    case 'disconnect':
      return handleDisconnect(state, event, rules);
    case 'timerFired':
      return handleTimer(state, event.now, rules);
  }
}
