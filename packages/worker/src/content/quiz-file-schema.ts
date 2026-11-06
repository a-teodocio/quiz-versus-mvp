import { ContentError } from './content-error.js';
import { z } from 'zod';
import type { Quiz, QuizEntry, QuizQuestionFields } from '@quiz-versus/core';
import { MAX_QUESTIONS_PER_GAME } from '@quiz-versus/protocol';

/** Bounds that keep a hostile or broken file from filling memory. The content rules live elsewhere. */
const MAX_ENTRIES_PER_FILE = 2_000;
const MAX_OPTIONS_READ = 20;
const MAX_TEXT_READ = 10_000;

const text = z.string().max(MAX_TEXT_READ);

const QuestionFields = z.object({
  id: text,
  question: text,
  options: z.array(text).max(MAX_OPTIONS_READ),
  correct: z.number().int().nonnegative(),
  explanation: text,
});

const TextEntry = QuestionFields.extend({ type: z.literal('text') });
const ImageEntry = QuestionFields.extend({ type: z.literal('image'), image_path: text });
const ImageGroupEntry = z.object({
  type: z.literal('image-group'),
  id: text,
  image_path: text,
  parts: z.array(QuestionFields).max(MAX_QUESTIONS_PER_GAME),
});

/**
 * The real app's quiz file, as far as the server needs it. Fields it does not read (course, unit,
 * group, notes) are dropped on the way in, so they can never reach a client. The title is read
 * for the quiz list only; it is not part of core's `Quiz`. It is read as it comes and judged in
 * `readQuizFile`, so a title that is not text never stops a quiz from being played.
 */
const QuizFile = z.object({
  title: z.unknown().optional(),
  questions: z
    .array(z.discriminatedUnion('type', [TextEntry, ImageEntry, ImageGroupEntry]))
    .max(MAX_ENTRIES_PER_FILE),
});

/** Copies a parsed question into a plain object of core's type. */
const fields = (question: z.infer<typeof QuestionFields>): QuizQuestionFields => ({
  id: question.id,
  question: question.question,
  options: question.options,
  correct: question.correct,
  explanation: question.explanation,
});

function toEntry(entry: z.infer<typeof QuizFile>['questions'][number]): QuizEntry {
  switch (entry.type) {
    case 'text':
      return { type: 'text', ...fields(entry) };
    case 'image':
      return { type: 'image', ...fields(entry), image_path: entry.image_path };
    case 'image-group':
      return {
        type: 'image-group',
        id: entry.id,
        image_path: entry.image_path,
        parts: entry.parts.map(fields),
      };
  }
}

/** A quiz file read and checked: core's `Quiz`, and the title the file gives it (if it has one). */
export interface QuizFileContents {
  readonly quiz: Quiz;
  readonly title: string | undefined;
}

/**
 * Checks the shape of a quiz file's text and returns it as core's `Quiz` with its title. Throws a
 * `ContentError` (naming `file`, never quoting it) when the text is not JSON or not that shape.
 */
export function readQuizFile(quizId: string, file: string, source: string): QuizFileContents {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    throw new ContentError(file, 'the file is not valid JSON');
  }
  const parsed = QuizFile.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') ?? '';
    throw new ContentError(file, `the file does not have the quiz shape (at "${where}")`);
  }
  return {
    quiz: { id: quizId, entries: parsed.data.questions.map(toEntry) },
    title: titleOf(parsed.data.title),
  };
}

/** The title if the file gave one that is text, not blank and not huge; else none (the id stands in). */
function titleOf(given: unknown): string | undefined {
  if (typeof given !== 'string' || given.length > MAX_TEXT_READ) return undefined;
  const title = given.trim();
  return title === '' ? undefined : title;
}
