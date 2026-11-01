import type { Item } from '../quiz/item.js';
import type { QuizEntry, QuizQuestionFields } from '../quiz/model.js';
import type { Random } from '../ports/random.js';
import { shuffleOptions } from '../shuffle/shuffle.js';
import { answerForms } from '../typed/answer-forms.js';
import { assertAskable } from './validate-question.js';

/** Options that fix what an item looks like, shared by every item of one game. */
export interface ItemStyle {
  readonly answerBy: 'pick' | 'type';
  readonly random: Random;
}

interface ItemSource {
  readonly key: string;
  readonly fields: QuizQuestionFields;
  readonly imageAlias: string | undefined;
  readonly part: Item['part'];
}

/** Shuffles one question and decides whether it is asked by picking or by typing. */
function buildItem(source: ItemSource, style: ItemStyle): Item {
  const { fields } = source;
  assertAskable(fields);
  const { options, correctIndex } = shuffleOptions(fields.options, fields.correct, style.random);
  const correctText = options[correctIndex] ?? '';
  const forms = style.answerBy === 'type' ? answerForms(correctText) : null;
  return {
    key: source.key,
    contentId: fields.id,
    prompt: fields.question,
    imageAlias: source.imageAlias,
    part: source.part,
    options,
    correctIndex,
    explanation: fields.explanation,
    mode: forms === null ? 'pick' : 'type',
    acceptedForms: forms ?? [],
  };
}

/**
 * The scored items of one entry, in order: one for a text or image question, one per part for an
 * image-group. `ordinal` is the entry's place in this game and makes the keys unique across a mix
 * of quiz files (`i12`, `i12p2`).
 */
export function buildItems(
  entry: QuizEntry,
  ordinal: number,
  imageAlias: string | undefined,
  style: ItemStyle,
): Item[] {
  if (entry.type !== 'image-group') {
    return [
      buildItem({ key: `i${String(ordinal)}`, fields: entry, imageAlias, part: undefined }, style),
    ];
  }
  return entry.parts.map((fields, at) =>
    buildItem(
      {
        key: `i${String(ordinal)}p${String(at + 1)}`,
        fields,
        imageAlias,
        part: { index: at + 1, count: entry.parts.length },
      },
      style,
    ),
  );
}
