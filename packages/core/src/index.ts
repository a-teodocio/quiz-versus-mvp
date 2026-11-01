// Public API of @quiz-versus/core. Everything else in this package is internal.

export type { Clock } from './ports/clock.js';
export type { Random } from './ports/random.js';
export type { Logger } from './ports/logger.js';
export type { QuizRepository } from './ports/quiz-repository.js';

export type {
  ImageEntry,
  ImageGroupEntry,
  Quiz,
  QuizEntry,
  QuizQuestionFields,
  TextEntry,
} from './quiz/model.js';
export type { Item } from './quiz/item.js';

export { shuffle, shuffleOptions } from './shuffle/shuffle.js';
export type { ShuffledOptions } from './shuffle/shuffle.js';
export { answerForms, answerTooLong } from './typed/answer-forms.js';
export { checkTyped } from './typed/check-typed.js';
export type { TypedCheck } from './typed/check-typed.js';
export { editDistance, normaliseTyped, sameTyped } from './typed/normalise.js';

export { BASE_POINTS, pointsFor, standardScoring } from './scoring/scoring-rule.js';
export type { ScoringContext, ScoringRule } from './scoring/scoring-rule.js';
export { rankPlayers } from './scoring/ranking.js';

export { GameSetupError } from './game/game-plan.js';
export type { GamePlan, GameSetupFailure } from './game/game-plan.js';
export { prepareGame } from './game/prepare-game.js';

export { createRoom } from './room/state.js';
export type {
  Cursor,
  Game,
  LobbyRoom,
  QuestionRoom,
  ResultsRoom,
  RevealRoom,
  RoomState,
  Seat,
  Tiebreak,
} from './room/state.js';
export type { NewIdentity, RoomEvent } from './room/events.js';
export type { Effect, Recipient } from './room/effects.js';
export type { Transition } from './room/transition.js';
export { defaultRules } from './room/rules.js';
export type { Rules } from './room/rules.js';
export { snapshotOf } from './room/messages.js';
export { step } from './room/reducer.js';
export { RoomSession } from './room/session.js';
export type { RoomInput, RoomSessionDeps } from './room/session.js';
