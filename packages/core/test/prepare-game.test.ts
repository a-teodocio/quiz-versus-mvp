import { MAX_TIEBREAK_ROUNDS } from '@quiz-versus/protocol';
import type { GameSettings } from '@quiz-versus/protocol';
import { describe, expect, it } from 'vitest';
import { GameSetupError } from '../src/game/game-plan.js';
import { prepareGame } from '../src/game/prepare-game.js';
import { answerForms } from '../src/typed/answer-forms.js';
import { seededRandom } from './support/fakes.js';
import { groupEntry, imageEntry, repositoryOf, textEntry, textQuiz } from './support/quizzes.js';

const settings = (overrides: Partial<GameSettings> = {}): GameSettings => ({
  quizIds: ['fake-quiz-one'],
  questionCount: 5,
  secondsPerQuestion: 20,
  answerBy: 'pick',
  ...overrides,
});

const repository = repositoryOf(textQuiz('fake-quiz-one', 30), textQuiz('fake-quiz-two', 30));

describe('prepareGame', () => {
  it('chooses the asked number of questions and a tie-break reserve', async () => {
    const plan = await prepareGame(repository, settings(), seededRandom(1));
    expect(plan.regular).toHaveLength(5);
    expect(plan.spare).toHaveLength(MAX_TIEBREAK_ROUNDS);
  });

  it('gives a shorter reserve when the quizzes hold barely enough questions', async () => {
    const plan = await prepareGame(
      repositoryOf(textQuiz('fake-quiz-one', 7)),
      settings(),
      seededRandom(1),
    );
    expect(plan.regular).toHaveLength(5);
    expect(plan.spare).toHaveLength(2);
  });

  it('has an empty reserve when the count uses every question', async () => {
    const plan = await prepareGame(
      repositoryOf(textQuiz('fake-quiz-one', 5)),
      settings(),
      seededRandom(1),
    );
    expect(plan.spare).toEqual([]);
  });

  it('is repeatable for the same random numbers and different for another seed', async () => {
    const first = await prepareGame(repository, settings(), seededRandom(5));
    const again = await prepareGame(repository, settings(), seededRandom(5));
    const other = await prepareGame(repository, settings(), seededRandom(6));
    expect(again).toEqual(first);
    expect(other.regular.map((item) => item.contentId)).not.toEqual(
      first.regular.map((item) => item.contentId),
    );
  });
});

describe('the prepared items', () => {
  it('keeps the correct option at the index it reports', async () => {
    const plan = await prepareGame(repository, settings(), seededRandom(3));
    for (const item of [...plan.regular, ...plan.spare]) {
      expect(item.options[item.correctIndex]).toBe('Right answer');
      expect(item.options).toHaveLength(4);
    }
  });

  it('issues unique keys across a mix of files whose content ids repeat', async () => {
    const same = (id: string) => ({
      id,
      entries: [textEntry('q1'), textEntry('q2'), textEntry('q3')],
    });
    const plan = await prepareGame(
      repositoryOf(same('fake-one'), same('fake-two')),
      settings({ quizIds: ['fake-one', 'fake-two'], questionCount: 6 }),
      seededRandom(2),
    );
    const keys = [...plan.regular, ...plan.spare].map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => /^i\d+(p\d+)?$/.test(key))).toBe(true);
  });

  it('refuses an unknown quiz and too few questions with a typed error', async () => {
    await expect(
      prepareGame(repository, settings({ quizIds: ['missing'] }), seededRandom(1)),
    ).rejects.toMatchObject({ reason: 'unknown-quiz' });
    await expect(
      prepareGame(repository, settings({ questionCount: 99 }), seededRandom(1)),
    ).rejects.toBeInstanceOf(GameSetupError);
    await expect(
      prepareGame(repository, settings({ questionCount: 99 }), seededRandom(1)),
    ).rejects.toMatchObject({ reason: 'not-enough-questions' });
  });
});

describe('image entries and groups', () => {
  const pictures = repositoryOf({
    id: 'fake-quiz-one',
    entries: [
      imageEntry('pic1', 'folder/secret-liver.png'),
      groupEntry('grp1', 'folder/other.png', 3),
    ],
  });

  it('hides image file names behind opaque names and maps them back', async () => {
    const plan = await prepareGame(pictures, settings({ questionCount: 4 }), seededRandom(4));
    const items = [...plan.regular, ...plan.spare];
    const aliases = new Set(items.map((item) => item.imageAlias));
    expect(aliases.size).toBe(2);
    for (const alias of aliases) {
      expect(alias).toMatch(/^[a-z0-9]{16}$/);
      expect(['folder/secret-liver.png', 'folder/other.png']).toContain(
        plan.images.get(alias ?? ''),
      );
    }
    expect(JSON.stringify(items)).not.toContain('secret-liver');
  });

  it('numbers group parts as parts of one picture and keeps them together', async () => {
    const plan = await prepareGame(pictures, settings({ questionCount: 4 }), seededRandom(4));
    const parts = [...plan.regular, ...plan.spare].filter((item) => item.part !== undefined);
    expect(parts.map((item) => item.part)).toEqual([
      { index: 1, count: 3 },
      { index: 2, count: 3 },
      { index: 3, count: 3 },
    ]);
    expect(new Set(parts.map((item) => item.imageAlias)).size).toBe(1);
    expect(parts.map((item) => item.key.replace(/^i\d+/, ''))).toEqual(['p1', 'p2', 'p3']);
  });

  it('cuts a group short when the count falls inside it (docs/fidelity.md)', async () => {
    const plan = await prepareGame(
      repositoryOf({ id: 'fake-quiz-one', entries: [groupEntry('grp1', 'a.png', 3)] }),
      settings({ questionCount: 2 }),
      seededRandom(1),
    );
    expect(plan.regular.map((item) => item.part?.index)).toEqual([1, 2]);
    expect(plan.spare.map((item) => item.part?.index)).toEqual([3]);
  });
});

describe('typed mode', () => {
  it('asks by typing only where the real app can check the text', async () => {
    const quiz = {
      id: 'fake-quiz-one',
      entries: [
        textEntry('plain', 'Zorbulin'),
        textEntry('digits', '12 units'),
        textEntry('long', 'This answer has many words'),
      ],
    };
    const plan = await prepareGame(
      repositoryOf(quiz),
      settings({ questionCount: 3, answerBy: 'type' }),
      seededRandom(1),
    );
    const byId = new Map(plan.regular.map((item) => [item.contentId, item]));
    expect(byId.get('plain')).toMatchObject({ mode: 'type', acceptedForms: ['Zorbulin'] });
    expect(byId.get('digits')?.mode).toBe('pick');
    expect(byId.get('long')?.mode).toBe('pick');
    expect(answerForms('12 units')).toBeNull();
  });

  it('keeps every question multiple choice when the host chose to pick', async () => {
    const plan = await prepareGame(
      repositoryOf({ id: 'fake-quiz-one', entries: [textEntry('plain', 'Zorbulin')] }),
      settings({ questionCount: 1 }),
      seededRandom(1),
    );
    expect(plan.regular[0]?.mode).toBe('pick');
  });
});

describe('questions the protocol cannot carry', () => {
  const entryWith = (change: Record<string, unknown>) => ({
    ...textEntry('bad1'),
    ...change,
  });
  const prepareWith = (change: Record<string, unknown>) =>
    prepareGame(
      repositoryOf({ id: 'fake-quiz-one', entries: [entryWith(change)] }),
      settings({ questionCount: 1 }),
      seededRandom(1),
    );

  it.each([
    ['three options', { options: ['a', 'b', 'c'] }],
    ['a correct index past the options', { correct: 4 }],
    ['a negative correct index', { correct: -1 }],
    ['a fractional correct index', { correct: 1.5 }],
    ['an empty explanation', { explanation: '' }],
    ['an empty option', { options: ['a', '', 'c', 'd'] }],
    ['an over-long question', { question: 'x'.repeat(2_001) }],
  ])('refuses a quiz with %s at setup', async (_name, change) => {
    await expect(prepareWith(change)).rejects.toMatchObject({ reason: 'invalid-quiz' });
  });

  it('refuses an image-group with more parts than a game may hold', async () => {
    const plan = prepareGame(
      repositoryOf({ id: 'fake-quiz-one', entries: [groupEntry('grp1', 'a.png', 101)] }),
      settings({ questionCount: 1 }),
      seededRandom(1),
    );
    await expect(plan).rejects.toMatchObject({ reason: 'invalid-quiz' });
  });

  it('accepts a question at the length limits', async () => {
    const plan = await prepareWith({ question: 'x'.repeat(2_000) });
    expect(plan.regular).toHaveLength(1);
  });
});
