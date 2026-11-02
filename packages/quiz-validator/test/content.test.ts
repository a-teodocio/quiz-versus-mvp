import { answerForms } from '@quiz-versus/core';
import { MAX_TIEBREAK_ROUNDS } from '@quiz-versus/protocol';
import { describe, expect, it } from 'vitest';
import { pngWidth } from '../src/images/image-source.js';
import { formatFinding, readContentTree, validateTree } from '../src/index.js';
import {
  contentRoot,
  LARGEST_TEST_GAME,
  loadContent,
  questionsOf,
} from './support/content-files.js';

describe('the fake content', () => {
  it('passes every check, including the strict ones', () => {
    const result = validateTree(readContentTree(contentRoot), { strict: true });
    expect(result.findings.map(formatFinding)).toEqual([]);
    expect(result.files.length).toBeGreaterThan(0);
  });
});

/**
 * The roadmap's list of cases the content must carry. Without these checks the list could erode
 * silently as questions are edited, and the games and tests built on it would stop covering them.
 */
const { courses, quizzes, tree } = loadContent();
const entries = quizzes.flatMap((quiz) => quiz.quiz.entries);
const groups = entries.flatMap((entry) => (entry.type === 'image-group' ? [entry] : []));
const questions = entries.flatMap(questionsOf);
const strings = questions.flatMap((q) => [q.question, q.explanation, ...q.options]);
const correctAnswers = questions.map((q) => q.options[q.correct] ?? '');

describe('the fake content keeps the kinds of entries the roadmap asks for', () => {
  it('has two courses, one asked by picking and one by typing', () => {
    const modes = [...courses.values()].map((course) => course.answerBy);
    expect(courses.size).toBeGreaterThanOrEqual(2);
    expect(modes).toContain('pick');
    expect(modes).toContain('type');
  });

  it('has text, image and image-group entries', () => {
    const types = new Set(entries.map((entry) => entry.type));
    expect([...types].sort()).toEqual(['image', 'image-group', 'text']);
  });

  it('has an image-group with three or more parts, and one with only two', () => {
    const sizes = groups.map((group) => group.parts.length);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(3);
    expect(sizes).toContain(2);
  });

  /** The last part of these groups asks about what the picture shows only by name, not by looking. */
  it.each(['birds_group_01_p3', 'rocks_group_01_p3'])(
    'keeps the follow-up part %s that does not need its picture',
    (id) => {
      const part = groups.flatMap((group) => group.parts).find((candidate) => candidate.id === id);
      expect(part).toBeDefined();
      expect(groups.some((group) => group.parts.at(-1)?.id === id)).toBe(true);
    },
  );

  it('has pictures that can be read, at least 400 pixels wide', () => {
    const paths = entries.flatMap((entry) => (entry.type === 'text' ? [] : [entry.image_path]));
    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) {
      const head = tree.images.fileHead(path);
      expect(head === undefined ? undefined : pngWidth(head), path).toBeGreaterThanOrEqual(400);
    }
  });

  it('has a file with a chapter in its name and one with a group label', () => {
    expect(quizzes.some((quiz) => /-ch\d+-/.test(quiz.id))).toBe(true);
    expect(quizzes.some((quiz) => quiz.group !== undefined)).toBe(true);
  });

  it('has enough scored items for the largest game the tests play, with its tie-break reserve', () => {
    expect(questions.length).toBeGreaterThanOrEqual(LARGEST_TEST_GAME + MAX_TIEBREAK_ROUNDS);
  });
});

describe('the fake content keeps the typed-answer and whitespace cases the roadmap asks for', () => {
  it('has correct answers a typed answer can be checked against, and some it cannot', () => {
    const checkable = correctAnswers.filter((answer) => answerForms(answer) !== null);
    const uncheckable = correctAnswers.filter((answer) => answerForms(answer) === null);
    expect(checkable.length).toBeGreaterThan(5);
    expect(uncheckable.length).toBeGreaterThan(5);
  });

  it.each<[string, (answer: string) => boolean]>([
    ['a bracketed short name', (answer) => /^[^()]+ \([^()]+\)$/.test(answer)],
    ['a bracket in the middle', (answer) => /^[^()]+ \([^()]+\) [^()]+$/.test(answer)],
    ['an apostrophe', (answer) => /['’]/.test(answer)],
    ['an accented letter and a hyphen', (answer) => /[à-ÿ]/.test(answer) && answer.includes('-')],
    ['digits', (answer) => /\d/.test(answer)],
    ['a comma', (answer) => answer.includes(',')],
    ['a slash', (answer) => answer.includes('/')],
    ['more than three words', (answer) => answer.split(/\s+/).length > 3],
    ['two brackets', (answer) => (answer.match(/\(/g) ?? []).length === 2],
  ])('has a correct answer with %s', (_name, matches) => {
    expect(correctAnswers.some(matches)).toBe(true);
  });

  it('has awkward whitespace in a stem, an option and an explanation', () => {
    const awkward = /^\s|\s$|\s{2}|[\t\n\u00a0]/;
    expect(questions.some((q) => awkward.test(q.question))).toBe(true);
    expect(questions.some((q) => q.options.some((option) => awkward.test(option)))).toBe(true);
    expect(questions.some((q) => awkward.test(q.explanation))).toBe(true);
    expect(strings.some((text) => text.includes('\u00a0'))).toBe(true);
    expect(strings.some((text) => text.includes('\t'))).toBe(true);
    expect(strings.some((text) => text.includes('\n'))).toBe(true);
  });

  it('has a typed answer whose extra spaces are collapsed by the check', () => {
    const spaced = correctAnswers.find((answer) => /\s{2}|\t/.test(answer));
    expect(spaced).toBeDefined();
    expect(answerForms(spaced ?? '')).toEqual([(spaced ?? '').replace(/\s+/g, ' ').trim()]);
  });
});
