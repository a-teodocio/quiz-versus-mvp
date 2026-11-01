/**
 * The quiz file schema of the real app, field names included (snake_case `image_path`), so a real
 * file and a mock file load the same way. `correct` indexes the unshuffled `options`.
 */

/** One multiple-choice question, or one part of an image-group. */
export interface QuizQuestionFields {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct: number;
  readonly explanation: string;
}

export interface TextEntry extends QuizQuestionFields {
  readonly type: 'text';
}

export interface ImageEntry extends QuizQuestionFields {
  readonly type: 'image';
  readonly image_path: string;
}

/** One picture with several questions (parts) about it. Each part is scored on its own. */
export interface ImageGroupEntry {
  readonly type: 'image-group';
  readonly id: string;
  readonly image_path: string;
  readonly parts: readonly QuizQuestionFields[];
}

export type QuizEntry = TextEntry | ImageEntry | ImageGroupEntry;

/** A loaded quiz file. */
export interface Quiz {
  readonly id: string;
  readonly entries: readonly QuizEntry[];
}
