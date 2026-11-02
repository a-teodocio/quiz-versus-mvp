/**
 * What counts as a course folder and a quiz file, as the real server decides it (`list_quiz_files`):
 * folders and files that start with `_` are left out, and so are folders that start with `.`.
 * One home, so the disk adapter and the tests agree.
 */

export const isCourseFolderName = (name: string): boolean =>
  !name.startsWith('_') && !name.startsWith('.');

export const isQuizFileName = (name: string): boolean =>
  name.endsWith('.json') && !name.startsWith('_');
