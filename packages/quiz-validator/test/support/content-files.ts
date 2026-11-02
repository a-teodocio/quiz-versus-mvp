import { join } from 'node:path';
import type { Quiz, QuizEntry, QuizQuestionFields } from '@quiz-versus/core';
import { loadRegistry, readContentTree, readRegistry } from '../../src/index.js';
import type { ContentTree, CourseEntry, QuizFileSource } from '../../src/index.js';

/** The biggest `questionCount` the content tests ask for; the content must hold that many plus a reserve. */
export const LARGEST_TEST_GAME = 40;

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

interface QuizFileData {
  readonly title: string;
  readonly group?: string;
  readonly questions: QuizEntry[];
}

/** Parses one file, naming it if it cannot be read, so a broken file is not an anonymous failure. */
function parse(file: QuizFileSource): QuizFileData {
  try {
    // Validated by content.test.ts; this only maps the file's `questions` onto core's `entries`.
    return JSON.parse(file.text) as QuizFileData;
  } catch (cause) {
    throw new Error(`${file.course}/${file.name} is not valid JSON: run npm run validate:content`, {
      cause,
    });
  }
}

/**
 * Reads the content folder and parses its quizzes into core's `Quiz` shape. The shape is not
 * checked here: the validator test does that, and these tests only run on content it accepts.
 */
export function loadContent(): LoadedContent {
  const tree = readContentTree(contentRoot);
  const quizzes = tree.quizFiles.map((file) => {
    const data = parse(file);
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
