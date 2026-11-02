import { checkQuizFile } from '../file/check-quiz-file.js';
import type { FileStats } from '../file/check-quiz-file.js';
import { error, sortFindings } from '../findings/finding.js';
import type { Finding } from '../findings/finding.js';
import { checkRegistry } from '../registry/check-registry.js';
import { loadRegistry, readRegistry } from '../registry/registry.js';
import type { ContentTree, QuizFileSource } from './content-tree.js';

export interface ValidateOptions {
  /** Also report the notes: heuristics that give false positives, and low-resolution pictures. */
  readonly strict: boolean;
}

export interface FileSummary {
  readonly course: string;
  readonly name: string;
  readonly stats: FileStats;
}

export interface ValidationResult {
  /** Sorted as the real validator prints them; notes only when `strict`. */
  readonly findings: readonly Finding[];
  /** One entry per file that could be read as a quiz. */
  readonly files: readonly FileSummary[];
}

const byCourseThenName = (a: QuizFileSource, b: QuizFileSource): number => {
  if (a.course !== b.course) return a.course < b.course ? -1 : 1;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
};

/** Where each progress key was first used, so a key reused in another file is caught. */
type KeyOwners = Map<string, { course: string; name: string }>;

function checkKeysAreUnique(file: QuizFileSource, keys: readonly string[], owners: KeyOwners) {
  const findings: Finding[] = [];
  for (const key of keys) {
    const owner = owners.get(key);
    if (owner === undefined) {
      owners.set(key, { course: file.course, name: file.name });
    } else if (owner.course !== file.course || owner.name !== file.name) {
      const where =
        owner.course === file.course ? owner.name : `${owner.name} in course ${owner.course}`;
      findings.push(
        error(
          { file: file.name, where: key },
          `id also used in ${where} (mixed-unit mode drops it, and progress is saved by id)`,
        ),
      );
    }
  }
  return findings;
}

/**
 * Checks a whole content folder: the course registry, every quiz file, and the rules that span
 * files (a file name used in two courses, an id used in two files). A port of the real
 * validator's `main`, without its printing.
 */
export function validateTree(tree: ContentTree, options: ValidateOptions): ValidationResult {
  const registryRead = readRegistry(tree.registryText);
  const registry = loadRegistry(registryRead);
  const findings: Finding[] = checkRegistry(registryRead, tree.courseFolders);
  for (const name of tree.looseQuizFileNames) {
    findings.push(
      error(
        { file: name, where: '-' },
        'quiz file is loose in quizzes/ (it belongs in a course folder, and the server ignores it)',
      ),
    );
  }
  const files: FileSummary[] = [];
  const courseOfName = new Map<string, string>();
  const keyOwners: KeyOwners = new Map();
  for (const file of [...tree.quizFiles].sort(byCourseThenName)) {
    const firstCourse = courseOfName.get(file.name);
    if (firstCourse !== undefined && firstCourse !== file.course) {
      findings.push(
        error(
          { file: file.name, where: '-' },
          `file name also used in course ${firstCourse}: the page finds files by name`,
        ),
      );
    }
    if (firstCourse === undefined) courseOfName.set(file.name, file.course);
    const result = checkQuizFile({
      name: file.name,
      text: file.text,
      course: registry.get(file.course),
      images: tree.images,
      strict: options.strict,
    });
    findings.push(...result.findings);
    if (result.stats !== undefined) {
      files.push({ course: file.course, name: file.name, stats: result.stats });
      findings.push(...checkKeysAreUnique(file, result.keys, keyOwners));
    }
  }
  const shown = options.strict ? findings : findings.filter((finding) => finding.level !== 'NOTE');
  return { findings: sortFindings(shown), files };
}
