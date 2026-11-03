import { askableProblem, type Quiz } from '@quiz-versus/core';
import {
  MAX_QUIZ_LISTINGS,
  MAX_SCORED_PARTS_PER_QUIZ,
  isQuizListing,
  type QuizListing,
} from '@quiz-versus/protocol';
import { ContentError } from './content-error.js';
import type { QuizFileContents } from './quiz-file-schema.js';

/** Where a quiz file is, and the course folder it sits in. */
export interface QuizFileRef {
  readonly path: string;
  readonly course: string;
}

/** A quiz file that is on disk but not offered to hosts, and why (never quoting the file). */
export interface SkippedQuiz {
  readonly id: string;
  readonly reason: string;
}

/** The quizzes a host can pick, and the files that were left out. */
export interface QuizCatalog {
  readonly quizzes: readonly QuizListing[];
  readonly skipped: readonly SkippedQuiz[];
}

/** Reads and checks one quiz file; throws a `ContentError` when it cannot be used. */
export type ReadQuizFileAt = (id: string, path: string) => Promise<QuizFileContents>;

/** The name under which the files past the end of the list are reported, once. */
export const REST_OF_THE_FILES = '(the rest)';

type Question = Parameters<typeof askableProblem>[0];

/** Code-unit order, so the list is in the same order on every machine and locale. */
const compare = (a: string, b: string): number => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/** Every question a game would ask from this quiz: a picture group is its parts. */
const questionsOf = (quiz: Quiz): readonly Question[] =>
  quiz.entries.flatMap((entry) => (entry.type === 'image-group' ? entry.parts : [entry]));

/**
 * The first reason a game could not use this quiz, or null: no questions, too many to show, or a
 * question core would refuse at set-up (`askableProblem`, the check `prepareGame` makes), so the
 * list never offers a quiz that would end in `INTERNAL_ERROR` at `start`.
 */
function unplayableReason(questions: readonly Question[]): string | null {
  if (questions.length === 0) return 'it has no questions';
  if (questions.length > MAX_SCORED_PARTS_PER_QUIZ) {
    return 'it has more questions than the list can show';
  }
  for (const question of questions) {
    const problem = askableProblem(question);
    if (problem !== null) return `a question ${problem}`;
  }
  return null;
}

/**
 * The listing for a quiz: its title, or its id when the title is not one the list allows (control
 * characters, over-long). Undefined when the course folder's name is not allowed either.
 */
function listingFor(
  id: string,
  course: string,
  title: string | undefined,
  scoredParts: number,
): QuizListing | undefined {
  const titles = title === undefined ? [id] : [title, id];
  return titles.map((t) => ({ id, course, title: t, scoredParts })).find(isQuizListing);
}

/**
 * Reads each quiz file once, one at a time, in course and id order, and lists the ones a game can
 * play. A file that cannot be read, is not a quiz, is too large, or has a question core would
 * refuse is left out and named. Once the list is full the rest are not read: they are counted in
 * one entry, so a huge folder costs neither time nor log lines.
 */
export async function buildQuizCatalog(
  files: ReadonlyMap<string, QuizFileRef>,
  read: ReadQuizFileAt,
): Promise<QuizCatalog> {
  const ordered = [...files].sort(
    ([idA, a], [idB, b]) => compare(a.course, b.course) || compare(idA, idB),
  );
  const quizzes: QuizListing[] = [];
  const skipped: SkippedQuiz[] = [];
  let unread = 0;
  for (const [id, { path, course }] of ordered) {
    if (quizzes.length >= MAX_QUIZ_LISTINGS) {
      unread += 1;
      continue;
    }
    try {
      const { quiz, title } = await read(id, path);
      const questions = questionsOf(quiz);
      const reason = unplayableReason(questions);
      const listing = listingFor(id, course, title, questions.length);
      if (reason !== null) skipped.push({ id, reason });
      else if (listing === undefined) {
        skipped.push({ id, reason: 'its course is not a name the quiz list allows' });
      } else quizzes.push(listing);
    } catch (error) {
      skipped.push({
        id,
        reason: error instanceof ContentError ? error.message : 'the file could not be read',
      });
    }
  }
  if (unread > 0) {
    skipped.push({
      id: REST_OF_THE_FILES,
      reason: `${String(unread)} more files, left unread because the list holds ${String(MAX_QUIZ_LISTINGS)}`,
    });
  }
  return { quizzes, skipped };
}
