import { answerForms, prepareGame, shuffleOptions } from '@quiz-versus/core';
import type { QuizRepository, Random } from '@quiz-versus/core';
import { MAX_TIEBREAK_ROUNDS } from '@quiz-versus/protocol';
import type { GameSettings } from '@quiz-versus/protocol';
import { describe, expect, it } from 'vitest';
import { LARGEST_TEST_GAME, loadContent, questionsOf } from './support/content-files.js';

/**
 * A small deterministic generator, so these tests never depend on real randomness. It is a copy of
 * the one in core's test support, which is not public API and so cannot be imported (A2).
 */
function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}

const { courses, quizzes, tree } = loadContent();
const repository: QuizRepository = {
  load: (quizId) => Promise.resolve(quizzes.find((quiz) => quiz.id === quizId)?.quiz),
};

const settings = (quizIds: string[], answerBy: 'pick' | 'type'): GameSettings => ({
  quizIds,
  questionCount: 10,
  secondsPerQuestion: 20,
  answerBy,
});

const allQuestions = quizzes.flatMap((quiz) => quiz.quiz.entries.flatMap(questionsOf));

describe('the fake content, played through the game logic', () => {
  it.each(quizzes.map((quiz) => [quiz.id, quiz] as const))(
    'a game can be prepared from %s alone',
    async (_id, quiz) => {
      const scored = quiz.quiz.entries.flatMap(questionsOf).length;
      const questionCount = Math.min(5, scored);
      const wanted = { ...settings([quiz.id], 'pick'), questionCount };
      const plan = await prepareGame(repository, wanted, seededRandom(7));
      expect(plan.regular).toHaveLength(questionCount);
      expect(plan.spare.length).toBeLessThanOrEqual(MAX_TIEBREAK_ROUNDS);
    },
  );

  it('prepares a game from every quiz at once, with a picture for every picture question', async () => {
    const ids = quizzes.map((quiz) => quiz.id);
    const plan = await prepareGame(
      repository,
      { ...settings(ids, 'pick'), questionCount: LARGEST_TEST_GAME },
      seededRandom(3),
    );
    expect(plan.regular).toHaveLength(LARGEST_TEST_GAME);
    expect(plan.images.size).toBeGreaterThan(0);
    for (const path of plan.images.values()) expect(tree.images.fileHead(path)).toBeDefined();
  });

  it('asks the typed course by typing where an answer can be checked, and by picking where not', async () => {
    const typedCourse = [...courses.values()].find((course) => course.answerBy === 'type');
    const ids = quizzes.filter((quiz) => quiz.course === typedCourse?.code).map((quiz) => quiz.id);
    const plan = await prepareGame(
      repository,
      { ...settings(ids, 'type'), questionCount: 20 },
      seededRandom(11),
    );
    const items = [...plan.regular, ...plan.spare];
    const typed = items.filter((item) => item.mode === 'type');
    expect(typed.length).toBeGreaterThan(0);
    expect(items.some((item) => item.mode === 'pick')).toBe(true);
    for (const item of typed) {
      expect(item.acceptedForms).toEqual(answerForms(item.options[item.correctIndex] ?? ''));
    }
  });

  it('never types a question when the game is asked by picking', async () => {
    const ids = quizzes.map((quiz) => quiz.id);
    const plan = await prepareGame(
      repository,
      { ...settings(ids, 'pick'), questionCount: LARGEST_TEST_GAME },
      seededRandom(5),
    );
    expect([...plan.regular, ...plan.spare].every((item) => item.mode === 'pick')).toBe(true);
  });
});

describe('where the correct answer ends up after the options are shuffled', () => {
  /** Draws that swap each position with itself, so nothing moves. */
  const staysPut: Random = { next: () => 0.999_999 };
  /** Draws that swap each position with the first, so every option moves. */
  const movesEverything: Random = { next: () => 0 };

  it('stays at the position the file gives it when the shuffle moves nothing', () => {
    for (const q of allQuestions) {
      expect(shuffleOptions(q.options, q.correct, staysPut).correctIndex).toBe(q.correct);
    }
  });

  it('still points at the correct text when every option moves', () => {
    for (const q of allQuestions) {
      const { options, correctIndex } = shuffleOptions(q.options, q.correct, movesEverything);
      expect(options[correctIndex]).toBe(q.options[q.correct]);
      expect(correctIndex).not.toBe(q.correct);
    }
  });

  it('still points at the correct text under many different shuffles', () => {
    const random = seededRandom(42);
    for (let round = 0; round < 20; round++) {
      for (const q of allQuestions) {
        const { options, correctIndex } = shuffleOptions(q.options, q.correct, random);
        expect(options[correctIndex]).toBe(q.options[q.correct]);
      }
    }
  });
});
