// The fake quiz files, read from content/ so a test can say which answer is right.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const contentDir = join(import.meta.dirname, '..', '..', '..', '..', 'content', 'quizzes');

export interface Part {
  readonly id?: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct: number;
  readonly explanation: string;
}

export interface Entry extends Partial<Part> {
  readonly type: 'text' | 'image' | 'image-group';
  readonly id?: string;
  readonly image_path?: string;
  readonly parts?: readonly Part[];
}

export interface QuizFile {
  readonly title: string;
  readonly unit: string;
  readonly questions: readonly Entry[];
}

/** One fake quiz file by its file name, e.g. `birds-ch2-field-notes.json`. */
export function quizFile(name: string): QuizFile {
  for (const course of readdirSync(contentDir, { withFileTypes: true })) {
    if (course.isDirectory() && readdirSync(join(contentDir, course.name)).includes(name)) {
      return JSON.parse(readFileSync(join(contentDir, course.name, name), 'utf8')) as QuizFile;
    }
  }
  throw new Error(`No fake quiz file named ${name}`);
}

/** Whitespace as the page shows it: runs collapsed, ends trimmed. */
export const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Every scored part of a file, in file order (a picture group gives one per part). */
export function partsOf(file: QuizFile): Part[] {
  return file.questions.flatMap((entry) =>
    entry.type === 'image-group' ? [...(entry.parts ?? [])] : [entry as Part],
  );
}

/** The part of a file that asks this question text. */
export function findPart(file: QuizFile, questionText: string): Part {
  const part = partsOf(file).find((p) => tidy(p.question) === tidy(questionText));
  if (part === undefined) throw new Error(`No question "${questionText}" in the file`);
  return part;
}

/** The right answer for a question text, from the file (the page shuffles the options, not the text). */
export function rightAnswer(file: QuizFile, questionText: string): string {
  const part = findPart(file, questionText);
  return tidy(part.options[part.correct] ?? '');
}

/** A wrong answer for a question text: the first option that is not the right one. */
export function wrongAnswer(file: QuizFile, questionText: string): string {
  const part = findPart(file, questionText);
  return tidy(part.options.find((_, i) => i !== part.correct) ?? '');
}
