import { OPTION_COUNT } from '@quiz-versus/protocol';
import { askableProblem } from '@quiz-versus/core';
import { error, MOCK_ONLY_PREFIX, warn, note } from '../findings/finding.js';
import type { Finding, Place } from '../findings/finding.js';
import {
  isFilled,
  isList,
  isText,
  isWholeNumber,
  pythonRepr,
  pythonText,
} from '../json/json-values.js';
import type { JsonObject } from '../json/json-values.js';
import { bracketLabels } from '../text/letter-labels.js';
import { countSentences, normaliseText } from '../text/normalise.js';

const MAX_EXPLANATION_SENTENCES = 3;
const FILLER_ANSWERS: ReadonlySet<string> = new Set([
  'all of the above',
  'none of the above',
  'both of the above',
]);
/** A correct answer this many times longer than every other option, and past the floor, stands out. */
const LONG_ANSWER_RATIO = 2;
const LONG_ANSWER_FLOOR = 30;

const WORD_BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const WORD_BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';
const OPENS_WITH_WHICH_OF_THE_FOLLOWING = /^which of the following/i;
const ENDS_WITH_AN_INSTRUCTION = new RegExp(
  `${WORD_BOUNDARY_BEFORE}(?:explain|describe|why or why not)${WORD_BOUNDARY_AFTER}\\.?\\s*$|${WORD_BOUNDARY_BEFORE}explain\\.`,
  'iu',
);

/** What the required fields held, with empty ones replaced by blanks so later checks can run. */
interface QuestionFields {
  readonly stem: string;
  readonly options: readonly unknown[];
  readonly correct: unknown;
  readonly explanation: string;
}

function checkStemPresent(place: Place, raw: unknown): { stem: string; findings: Finding[] } {
  if (isFilled(raw)) return { stem: raw, findings: [] };
  return { stem: '', findings: [error(place, 'missing or empty question text')] };
}

function checkOptionList(
  place: Place,
  raw: unknown,
): { options: readonly unknown[]; findings: Finding[] } {
  if (!isList(raw) || raw.length !== OPTION_COUNT) {
    const got = isList(raw) ? String(raw.length) : pythonText(raw);
    const message = `options must be a list of ${String(OPTION_COUNT)} (got ${got})`;
    return { options: isList(raw) ? raw : [], findings: [error(place, message)] };
  }
  const texts = raw.filter(isFilled);
  if (texts.length !== raw.length) {
    return { options: raw, findings: [error(place, 'an option is empty or not a string')] };
  }
  const normalised = texts.map(normaliseText);
  const duplicates = new Set(normalised).size !== normalised.length;
  return { options: raw, findings: duplicates ? [error(place, 'duplicate options')] : [] };
}

function checkCorrectIndex(place: Place, correct: unknown, optionCount: number): Finding[] {
  const inRange = isWholeNumber(correct) && correct >= 0 && correct < Math.max(optionCount, 1);
  if (inRange) return [];
  return [error(place, `"correct" must be an index into options (got ${pythonRepr(correct)})`)];
}

function checkExplanationPresent(
  place: Place,
  raw: unknown,
): { explanation: string; findings: Finding[] } {
  if (isFilled(raw)) return { explanation: raw, findings: [] };
  return { explanation: '', findings: [error(place, 'missing or empty explanation')] };
}

/** The real validator's schema errors for one question or one group part. */
function checkRequired(
  place: Place,
  node: JsonObject,
): { fields: QuestionFields; findings: Finding[] } {
  const stem = checkStemPresent(place, node['question']);
  const options = checkOptionList(place, node['options']);
  const explanation = checkExplanationPresent(place, node['explanation']);
  const correct = node['correct'];
  const fields = {
    stem: stem.stem,
    options: options.options,
    correct,
    explanation: explanation.explanation,
  };
  const findings = [
    ...stem.findings,
    ...options.findings,
    ...checkCorrectIndex(place, correct, options.options.length),
    ...explanation.findings,
  ];
  return { fields, findings };
}

function checkStemWording(place: Place, stem: string): Finding[] {
  if (stem === '') return [];
  const trimmed = stem.trim();
  const findings: Finding[] = [];
  if (!trimmed.endsWith('?')) findings.push(warn(place, 'stem does not end with a question mark'));
  if (trimmed.split('?').length - 1 > 1) {
    findings.push(warn(place, 'stem contains more than one question mark (one question per stem)'));
  }
  if (OPENS_WITH_WHICH_OF_THE_FOLLOWING.test(trimmed)) {
    findings.push(warn(place, 'stem opens with "Which of the following"'));
  }
  if (ENDS_WITH_AN_INSTRUCTION.test(trimmed)) {
    findings.push(warn(place, 'stem ends with "Explain."/"Describe."'));
  }
  return findings;
}

function checkLabelBrackets(place: Place, fields: QuestionFields): Finding[] {
  const findings: Finding[] = [];
  for (const [name, text] of [
    ['stem', fields.stem],
    ['explanation', fields.explanation],
  ] as const) {
    if (text !== '' && bracketLabels(text) !== text) {
      findings.push(
        warn(
          place,
          `${name} has a letter label without round brackets (write "arrow (a)", not "arrow a")`,
        ),
      );
    }
  }
  return findings;
}

function checkOptionWording(place: Place, options: readonly unknown[]): Finding[] {
  return options
    .filter(isText)
    .filter((option) => FILLER_ANSWERS.has(normaliseText(option)))
    .map((option) => warn(place, `option "${option}" (never use all/none of the above)`));
}

function checkExplanationLength(place: Place, explanation: string): Finding[] {
  if (explanation === '') return [];
  const sentences = countSentences(explanation);
  if (sentences <= MAX_EXPLANATION_SENTENCES) return [];
  return [warn(place, `explanation has ${String(sentences)} sentences (guide: 3 max)`)];
}

/** `--strict` only: a correct answer much longer than every distractor gives itself away. */
function checkAnswerLength(place: Place, fields: QuestionFields): Finding[] {
  const { options, correct } = fields;
  if (!isWholeNumber(correct) || correct < 0 || correct >= options.length) return [];
  if (!options.every(isText)) return [];
  const lengths = options.map((option) => Array.from(option).length);
  const others = lengths.filter((_length, at) => at !== correct);
  const own = lengths[correct] ?? 0;
  if (others.length === 0 || own <= LONG_ANSWER_RATIO * Math.max(...others)) return [];
  if (own <= LONG_ANSWER_FLOOR) return [];
  return [note(place, 'correct answer is more than twice as long as every distractor')];
}

/** What `prepareGame` will refuse that the real rules let through (too long for the protocol). */
function checkAskable(place: Place, node: JsonObject, fields: QuestionFields): Finding[] {
  const { options, correct } = fields;
  if (!options.every(isText) || !isWholeNumber(correct)) return [];
  const problem = askableProblem({
    id: isText(node['id']) ? node['id'] : '',
    question: fields.stem,
    options,
    correct,
    explanation: fields.explanation,
  });
  return problem === null
    ? []
    : [error(place, `${MOCK_ONLY_PREFIX}the game would refuse it: ${problem}`)];
}

/**
 * Every check shared by a standalone question and a group part, in the real validator's order:
 * schema errors, then the wording guidelines. Then, only if the real rules found no error, the
 * mock's own rule that the question can be sent over the protocol.
 */
export function checkQuestion(place: Place, node: JsonObject, strict: boolean): Finding[] {
  const { fields, findings: errors } = checkRequired(place, node);
  const findings = [
    ...errors,
    ...checkStemWording(place, fields.stem),
    ...checkLabelBrackets(place, fields),
    ...checkOptionWording(place, fields.options),
    ...checkExplanationLength(place, fields.explanation),
    ...(strict ? checkAnswerLength(place, fields) : []),
  ];
  return errors.length === 0 ? [...findings, ...checkAskable(place, node, fields)] : findings;
}
