import type { Answer, Progress, RevealMessage } from '@quiz-versus/protocol';
import type { Item } from '../quiz/item.js';
import { pointsFor } from '../scoring/scoring-rule.js';
import { checkAgainstForms } from '../typed/check-typed.js';
import type { Rules } from './rules.js';
import { askedIds as askedPlayerIds } from './open-question.js';
import type { OpenQuestion, QuestionRoom, Seat } from './state.js';

type PlayerResult = RevealMessage['results'][number];

interface Judgement {
  readonly correct: boolean;
  readonly near: boolean;
}

/** Whether an answer is right for this item. A kind that does not match the mode is wrong. */
export function judge(item: Item, answer: Answer): Judgement {
  if (answer.kind === 'pick')
    return { correct: item.mode === 'pick' && answer.index === item.correctIndex, near: false };
  if (item.mode !== 'type') return { correct: false, near: false };
  const checked = checkAgainstForms(answer.text, item.acceptedForms);
  return { correct: checked.ok, near: checked.near };
}

/** The outcome for one player who may answer the question. `answer` is null if they did not. */
function resultFor(
  seat: Seat,
  open: OpenQuestion,
  progress: Progress,
  rules: Rules,
): { readonly result: PlayerResult; readonly correct: boolean } {
  const answer = open.answers.find((entry) => entry.playerId === seat.id)?.answer ?? null;
  const verdict = answer === null ? { correct: false, near: false } : judge(open.item, answer);
  const points = pointsFor(rules.scoring, verdict.correct, { progress });
  const outcome = answer === null ? 'no-answer' : verdict.correct ? 'correct' : 'wrong';
  return {
    correct: verdict.correct,
    result: {
      playerId: seat.id,
      outcome,
      near: verdict.near,
      points,
      score: seat.score + points,
      answer,
    },
  };
}

/** What grading a closed question produced. */
export interface Graded {
  readonly results: readonly PlayerResult[];
  /** All seats, with scores and correct counts brought up to date. */
  readonly seats: readonly Seat[];
}

/**
 * Grades every player who could answer the question and applies the points. Called only when the
 * question closes, so scores never move while it is open.
 */
export function gradeQuestion(room: QuestionRoom, progress: Progress, rules: Rules): Graded {
  const { seats, open } = room;
  const askedIds = askedPlayerIds(room);
  const asked = seats.filter((seat) => askedIds.includes(seat.id));
  const graded = asked.map((seat) => ({ seat, ...resultFor(seat, open, progress, rules) }));
  const updated = seats.map((seat) => {
    const hit = graded.find((entry) => entry.seat.id === seat.id);
    if (hit === undefined) return seat;
    return {
      ...seat,
      score: hit.result.score,
      correctCount: seat.correctCount + (hit.correct ? 1 : 0),
    };
  });
  return { results: graded.map((entry) => entry.result), seats: updated };
}
