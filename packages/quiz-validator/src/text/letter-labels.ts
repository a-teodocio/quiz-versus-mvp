import { WORD_CHARACTER } from './normalise.js';

/**
 * Finds a letter drawn on a picture and written without round brackets ("arrow a" instead of
 * "arrow (a)"). A port of `bracket_labels` in the real validator, kept as close to it as
 * JavaScript allows; the pieces below are named after the Python ones.
 */

const NOT_AFTER_WORD = `(?<!${WORD_CHARACTER})`;
const NOT_BEFORE_WORD = `(?!${WORD_CHARACTER})`;

const KEYWORD =
  '(?:arrows?|brackets?|bracketed|labell?ed|labell?ing|labels?|letters?|pointers?|boxe?s?|marked|marks?|marker|asterisks?|spans?)';
const FILLER =
  '(?:\\s+(?:labell?ed|labeled|with|the|letter|by|at|of|numbered|long|small|short|upper|lower|left|right|top|bottom|first|second|third|yellow|red|black|white|green|blue|area))*';
/** One letter, or two or three capitals such as CL or GM. */
const TOKEN = '(?:[A-Za-z]|[A-Z]{2,3})';
const ONE_LABEL = `${TOKEN}(?![-\\p{L}\\p{N}_/'])`;
const LABEL_LIST = `${ONE_LABEL}(?:(?:\\s*,\\s*|\\s+and\\s+|\\s+or\\s+|\\s*,\\s*and\\s+|\\s*/\\s*)${ONE_LABEL})*`;

const LABEL = new RegExp(
  `${NOT_AFTER_WORD}(?<keyword>${KEYWORD})${NOT_BEFORE_WORD}(?<filler>${FILLER})\\s+(?<list>${LABEL_LIST})`,
  'dgiu',
);
const BARE_TOKEN = new RegExp(`(?<![\\p{L}\\p{N}_(])(${TOKEN})(?![-\\p{L}\\p{N}_)'/])`, 'gu');
/** "M marks the shaft": a label that opens the sentence. */
const LEADING_LABEL = new RegExp(
  `(?<![\\p{L}\\p{N}_(])([A-Z]{1,3})(?= marks${NOT_BEFORE_WORD})`,
  'gu',
);

const WEAK_KEYWORDS = new Set(['marked', 'marks', 'marker', 'spans', 'span', 'bracketed']);
const ENDS_THE_PHRASE = new RegExp(`^(?:\\s*[?.,;:]|\\s*$|\\s+(?:is|are)${NOT_BEFORE_WORD})`, 'u');
const ENDS_OR_JOINS = new RegExp(`^(?:\\s*[?.,;:]|\\s*$|\\s+and${NOT_BEFORE_WORD})`, 'u');

const inBrackets = (list: string): string =>
  list.replace(BARE_TOKEN, (_match, token: string) => `(${token})`);

/**
 * "marks a secondary feather" is not a label, so after a weak keyword a bare "a" counts only when
 * the phrase stops or a verb follows; after "label" a bare "a" only when the phrase stops or joins.
 */
function isReallyALabel(keyword: string, filler: string, list: string, tail: string): boolean {
  const tokens = [...list.matchAll(BARE_TOKEN)].map((match) => match[1] ?? '');
  if (WEAK_KEYWORDS.has(keyword) && !filler.toLowerCase().includes('letter')) {
    if (!ENDS_THE_PHRASE.test(tail)) return false;
  }
  if (keyword.startsWith('label') && tokens.length === 1 && tokens[0]?.toLowerCase() === 'a') {
    return ENDS_OR_JOINS.test(tail);
  }
  return true;
}

/** The text with every letter label written in round brackets. Text that has none is returned as it is. */
export function bracketLabels(text: string): string {
  let result = '';
  let position = 0;
  for (const match of text.matchAll(LABEL)) {
    const range = match.indices?.groups?.['list'];
    const { keyword = '', filler = '', list = '' } = match.groups ?? {};
    if (range === undefined) continue;
    const tail = text.slice(range[1], range[1] + 2);
    if (!isReallyALabel(keyword.toLowerCase(), filler, list, tail)) continue;
    result += text.slice(position, range[0]) + inBrackets(list);
    position = range[1];
  }
  result += text.slice(position);
  return result.replace(LEADING_LABEL, (_match, token: string) => `(${token})`);
}
