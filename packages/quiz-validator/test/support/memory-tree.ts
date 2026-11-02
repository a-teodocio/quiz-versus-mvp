import type { ContentTree, QuizFileSource } from '../../src/index.js';
import { isCourseFolderName, isQuizFileName } from '../../src/tree/listing-rules.js';
import { pictureHead } from './picture-head.js';

/** A content folder described as data: what a test wants the validator to look at. */
export interface MemoryFolder {
  /** The registry's JSON, or null for a folder with no registry file. */
  readonly registry: unknown;
  /** Paths under `quizzes/` (`course/name.json`), each with the file's JSON, or its text if a string. */
  readonly files: Readonly<Record<string, unknown>>;
  /** JSON files directly in `quizzes/`. */
  readonly rootFiles?: Readonly<Record<string, unknown>>;
  readonly emptyFolders?: readonly string[];
  /** Picture paths and their widths in pixels. */
  readonly images?: Readonly<Record<string, number>>;
}

const textOf = (body: unknown): string => (typeof body === 'string' ? body : JSON.stringify(body));

/** Builds the tree the real server's rules would find in such a folder. */
export function memoryTree(folder: MemoryFolder): ContentTree {
  const quizFiles: QuizFileSource[] = [];
  const folders = new Set(folder.emptyFolders ?? []);
  for (const [path, body] of Object.entries(folder.files)) {
    const [course = '', name = ''] = path.split('/');
    folders.add(course);
    if (isCourseFolderName(course) && isQuizFileName(name)) {
      quizFiles.push({ course, name, text: textOf(body) });
    }
  }
  const heads = new Map(
    Object.entries(folder.images ?? {}).map(([path, width]) => [path, pictureHead(width)]),
  );
  return {
    registryText: folder.registry === null ? undefined : textOf(folder.registry),
    courseFolders: [...folders].filter(isCourseFolderName),
    quizFiles,
    looseQuizFileNames: Object.keys(folder.rootFiles ?? {}).filter(isQuizFileName),
    images: { fileHead: (path) => heads.get(path) },
  };
}
