// The functions the forked page declares at the top level of its script, which tests call
// through `page.evaluate` to check them against fixtures made from the real app.
export interface TypedVerdict {
  readonly ok: boolean;
  readonly near: boolean;
}

export interface PageFunctions {
  shuffleQuestion(q: { type: string; options: string[]; correct: number }): {
    options: string[];
    shuffledCorrect: number;
  };
  answerTooLong(correct: string): boolean;
  answerForms(correct: string): string[] | null;
  normTyped(text: string): string;
  sameTyped(a: string, b: string): boolean;
  editDistance(a: string, b: string): number;
  checkTyped(typed: string, correct: string): TypedVerdict;
  entryKeys(entry: object): string[];
}
