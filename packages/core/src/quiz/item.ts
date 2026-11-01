/**
 * One scored item of a game: a standalone question, or one part of an image-group. Everything
 * the server needs to ask it and to grade it, already shuffled. Never sent to clients as it is;
 * the room builds `question` and `reveal` messages from it.
 */
export interface Item {
  /** Issued by the game, unique within it (`i12`, `i12p2`). Not a content id. */
  readonly key: string;
  /** The quiz entry's id, or the part's id; the real app's progress key (`entryKeys()`). */
  readonly contentId: string;
  readonly prompt: string;
  /** Opaque name under /images/ standing in for the file; see `GamePlan.images`. */
  readonly imageAlias: string | undefined;
  /** Which part of an image-group, counting from 1. Absent for a standalone question. */
  readonly part: { readonly index: number; readonly count: number } | undefined;
  /** Options in the order players see them. */
  readonly options: readonly string[];
  readonly correctIndex: number;
  readonly explanation: string;
  /** `type` only where the real app can check the text automatically. */
  readonly mode: 'pick' | 'type';
  /** Texts accepted for a typed answer; empty for `pick`. */
  readonly acceptedForms: readonly string[];
}
