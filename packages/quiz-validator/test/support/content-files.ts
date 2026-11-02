import { join } from 'node:path';
import type { Quiz, QuizEntry, QuizQuestionFields } from '@quiz-versus/core';
import { loadRegistry, readContentTree, readRegistry } from '../../src/index.js';
import type { ContentTree, CourseEntry } from '../../src/index.js';

/** The fake content folder at the root of the repository. */
export const contentRoot = join(import.meta.dirname, '..', '..', '..', '..', 'content');

export interface LoadedQuiz {
  readonly course: string;
  /** The file name without `.json`: the quiz id the game uses. */
  readonly id: string;
  readonly quiz: Quiz;
  readonly title: string;
  readonly group: string | undefined;
}

export interface LoadedContent {
  readonly tree: ContentTree;
  readonly courses: ReadonlyMap<string, CourseEntry>;
  readonly quizzes: readonly LoadedQuiz[];
}

/** One scored item of the content: a standalone question or one part of a group. */
export function questionsOf(entry: QuizEntry): readonly QuizQuestionFields[] {
  return entry.type === 'image-group' ? entry.parts : [entry];
}

/**
 * Reads the content folder and parses its quizzes into core's `Quiz` shape. The shape is not
 * checked here: the validator test does that, and these tests only run on content it accepts.
 */
export function loadContent(): LoadedContent {
  const tree = readContentTree(contentRoot);
  const quizzes = tree.quizFiles.map((file) => {
    // Validated by content.test.ts; this only maps the file's `questions` onto core's `entries`.
    const data = JSON.parse(file.text) as {
      title: string;
      group?: string;
      questions: QuizEntry[];
    };
    const id = file.name.replace(/\.json$/, '');
    return {
      course: file.course,
      id,
      quiz: { id, entries: data.questions },
      title: data.title,
      group: data.group,
    };
  });
  return { tree, courses: loadRegistry(readRegistry(tree.registryText)), quizzes };
}
