import type { ImageSource } from '../images/image-source.js';

/** One quiz file as found in a course folder. */
export interface QuizFileSource {
  /** The course folder it sits in. */
  readonly course: string;
  /** The file name, such as `birds-w1-plumage.json`. */
  readonly name: string;
  /** What the file holds, as text. */
  readonly text: string;
}

/**
 * Everything the validator needs to know about the content folder, read in advance so the checks
 * stay pure. `readContentTree` builds one from disk; a test builds one in memory. It follows the
 * real server's rules for what counts as a quiz: `quizzes/<course>/*.json`, one level down, with
 * names and folders that start with `_` (or `.` for folders) left out.
 */
export interface ContentTree {
  /** The text of `quizzes/courses.json`, or undefined when there is no such file. */
  readonly registryText: string | undefined;
  /** The names of the folders inside `quizzes/` that are courses. */
  readonly courseFolders: readonly string[];
  readonly quizFiles: readonly QuizFileSource[];
  /** JSON files directly in `quizzes/` other than the registry: the server ignores them. */
  readonly looseQuizFileNames: readonly string[];
  readonly images: ImageSource;
}
