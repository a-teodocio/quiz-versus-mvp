import { readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Quiz, QuizRepository } from '@quiz-versus/core';
import { isQuizId } from '@quiz-versus/protocol';
import { MAX_QUIZ_FILE_BYTES } from '../config/defaults.js';
import { ContentError } from './content-error.js';
import { parseQuizFile } from './quiz-file-schema.js';

const QUIZZES_FOLDER = 'quizzes';
const QUIZ_FILE_SUFFIX = '.json';

/** The real server leaves out folders and files that start with `_`, and folders that start with `.`. */
const isCourseFolder = (name: string): boolean => !name.startsWith('_') && !name.startsWith('.');
const isQuizFile = (name: string): boolean =>
  name.endsWith(QUIZ_FILE_SUFFIX) && !name.startsWith('_');

/** Quiz id to the file that holds it, from `quizzes/<course>/<id>.json`, one level down. */
function listQuizFiles(contentRoot: string): Map<string, string> {
  const quizzes = join(contentRoot, QUIZZES_FOLDER);
  const files = new Map<string, string>();
  for (const course of readdirSync(quizzes).filter(isCourseFolder)) {
    const folder = join(quizzes, course);
    if (!statSync(folder).isDirectory()) continue;
    for (const name of readdirSync(folder).filter(isQuizFile)) {
      const path = join(folder, name);
      const id = name.slice(0, -QUIZ_FILE_SUFFIX.length);
      if (!statSync(path).isFile() || !isQuizId(id)) continue;
      if (files.has(id)) throw new ContentError(path, `two quiz files share the id "${id}"`);
      files.set(id, path);
    }
  }
  return files;
}

/** What `listQuizIds` and `load` need to read quiz files in the real app's folder layout. */
export interface DiskQuizRepository extends QuizRepository {
  /** The ids that can be loaded, sorted. */
  listQuizIds(): readonly string[];
}

/**
 * Reads quiz files from `<contentRoot>/quizzes/<course>/<id>.json`; the quiz id is the file name
 * without `.json` (docs/fidelity.md). The files are listed once, when this is made. A file is
 * read and checked each time it is loaded, never trusted: it must be small and have the quiz
 * shape (ADR 12). The id a player asks for is looked up in the list and never used as a path.
 */
export function createDiskQuizRepository(contentRoot: string): DiskQuizRepository {
  const files = listQuizFiles(contentRoot);
  return {
    listQuizIds: () => [...files.keys()].sort(),
    async load(quizId): Promise<Quiz | undefined> {
      const path = files.get(quizId);
      if (path === undefined) return undefined;
      const name = `${quizId}${QUIZ_FILE_SUFFIX}`;
      if (statSync(path).size > MAX_QUIZ_FILE_BYTES) {
        throw new ContentError(name, 'the file is too large');
      }
      return parseQuizFile(quizId, name, await readFile(path, 'utf8'));
    },
  };
}
