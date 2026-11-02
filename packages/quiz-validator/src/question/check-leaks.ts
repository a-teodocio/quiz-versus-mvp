import { note, warn } from '../findings/finding.js';
import type { Finding, Place } from '../findings/finding.js';
import { isList, isText, isWholeNumber } from '../json/json-values.js';
import type { JsonObject } from '../json/json-values.js';
import { containsPhrase, normaliseText } from '../text/normalise.js';

/** The text of the correct option, or undefined when the part has no usable one. */
function answerText(part: JsonObject): string | undefined {
  const { options, correct } = part;
  if (!isList(options) || !isWholeNumber(correct)) return undefined;
  const answer = options[correct];
  return isText(answer) ? answer : undefined;
}

function optionTexts(part: JsonObject): Set<string> {
  const { options } = part;
  return new Set(isList(options) ? options.filter(isText).map(normaliseText) : []);
}

interface Leak {
  readonly earlier: number;
  readonly later: number;
  readonly answer: string;
  readonly isEarlierDistractor: boolean;
}

/** What an earlier part shows the player: its explanation, and its own answer and options. */
interface Shown {
  readonly explanation: string;
  /** Undefined when the part has no usable answer. */
  readonly ownAnswer: string | undefined;
  readonly ownOptions: ReadonlySet<string>;
}

/** The shortest answer worth looking for in an explanation; shorter ones match by accident. */
const MIN_LEAKED_ANSWER_LENGTH = 4;

function shownBy(part: JsonObject): Shown {
  const explanation = part['explanation'];
  const own = answerText(part);
  return {
    explanation: normaliseText(isText(explanation) ? explanation : ''),
    ownAnswer: own === undefined ? undefined : normaliseText(own),
    ownOptions: optionTexts(part),
  };
}

/** The answer of `later` if the earlier part's explanation spells it out, as written in `later`. */
function leakedAnswer(shown: Shown, later: JsonObject | undefined): string | undefined {
  const raw = later === undefined ? undefined : answerText(later);
  const answer = raw === undefined ? '' : normaliseText(raw);
  if (raw === undefined || answer.length < MIN_LEAKED_ANSWER_LENGTH) return undefined;
  if (answer === shown.ownAnswer || !containsPhrase(shown.explanation, answer)) return undefined;
  return raw;
}

/** The later parts whose answers an earlier part's explanation spells out. */
function leaksFrom(parts: readonly JsonObject[], earlier: number): Leak[] {
  const part = parts[earlier];
  const shown = part === undefined ? undefined : shownBy(part);
  if (shown === undefined || shown.explanation === '') return [];
  const leaks: Leak[] = [];
  for (let later = earlier + 1; later < parts.length; later++) {
    const answer = leakedAnswer(shown, parts[later]);
    if (answer === undefined) continue;
    const isEarlierDistractor = shown.ownOptions.has(normaliseText(answer));
    leaks.push({ earlier, later, answer, isEarlierDistractor });
  }
  return leaks;
}

/**
 * An earlier part's explanation must not state a later part's answer, because the explanation is
 * shown right after the earlier part. A leak of something that is also one of the earlier part's
 * options is only a note, since a distractor may well repeat later.
 */
export function checkLeaks(file: string, groupId: string, parts: readonly JsonObject[]): Finding[] {
  const findings: Finding[] = [];
  for (let earlier = 0; earlier < parts.length; earlier++) {
    for (const leak of leaksFrom(parts, earlier)) {
      const where = `${groupId} p${String(leak.earlier + 1)}->p${String(leak.later + 1)}`;
      const place: Place = { file, where };
      const first = `p${String(leak.earlier + 1)}`;
      if (!leak.isEarlierDistractor) {
        findings.push(
          warn(
            place,
            `explanation of ${first} contains the answer of p${String(leak.later + 1)}: "${leak.answer}"`,
          ),
        );
      } else {
        findings.push(
          note(
            place,
            `${first} explanation mentions "${leak.answer}" (a distractor of ${first}, but it is the answer of p${String(leak.later + 1)})`,
          ),
        );
      }
    }
  }
  return findings;
}
