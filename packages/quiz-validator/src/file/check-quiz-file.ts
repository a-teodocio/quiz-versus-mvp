import { isQuizId } from '@quiz-versus/protocol';
import { error, MOCK_ONLY_PREFIX, note, warn } from '../findings/finding.js';
import type { Finding, Place } from '../findings/finding.js';
import { checkImage } from '../images/check-image.js';
import type { ImageSource } from '../images/image-source.js';
import { isFilled, isList, isObject, isText, isTruthy, pythonRepr } from '../json/json-values.js';
import type { JsonObject } from '../json/json-values.js';
import { checkLeaks } from '../question/check-leaks.js';
import { checkQuestion } from '../question/check-question.js';
import type { CourseEntry } from '../registry/registry.js';
import { escapeForRegExp, normaliseText } from '../text/normalise.js';
import { entryKeys } from './entry-keys.js';

const ENTRY_TYPES: readonly unknown[] = ['text', 'image', 'image-group'];
/** The longest `group` label the unit tabs accept. */
const GROUP_LABEL_MAX_LENGTH = 30;
/** The parts per image-group the question guide aims for. */
const PARTS_TARGET = { min: 2, max: 5 };
const REQUIRED_TEXT_FIELDS = ['title', 'course', 'unit'];
const GROUP_ONLY_PLACES = ['question', 'options', 'correct', 'explanation'];

export interface FileStats {
  /** Top-level entries, valid or not. */
  readonly entries: number;
  /** Scored items: one per question, one per group part. */
  readonly scored: number;
  readonly groups: number;
}

export interface QuizFileInput {
  /** The file name, such as `birds-w1-plumage.json`. */
  readonly name: string;
  readonly text: string;
  /** The file's registry entry, or undefined for an unregistered course. */
  readonly course: CourseEntry | undefined;
  readonly images: ImageSource;
  readonly strict: boolean;
}

export interface QuizFileResult {
  readonly findings: readonly Finding[];
  /** Absent when the file could not be read as a quiz at all. */
  readonly stats: FileStats | undefined;
  /** The progress keys of every entry, for the check that ids are unique across files. */
  readonly keys: readonly string[];
}

/** Collects what one file's checks find. One is made per file and not reused. */
class QuizFileChecker {
  readonly findings: Finding[] = [];
  private readonly seenIds = new Set<string>();
  private readonly seenQuestionText = new Map<string, string>();
  private readonly seenImages = new Set<string>();
  private entries = 0;
  private scored = 0;
  private groups = 0;
  private readonly idPrefix: string;

  constructor(private readonly input: QuizFileInput) {
    const { course } = input;
    const short = course?.short ?? '';
    this.idPrefix = short !== '' && course?.legacyIds !== true ? `${short}_` : '';
  }

  get stats(): FileStats {
    return { entries: this.entries, scored: this.scored, groups: this.groups };
  }

  private get file(): string {
    return this.input.name;
  }

  private place(where: string): Place {
    return { file: this.file, where };
  }

  checkTopLevel(data: JsonObject): void {
    const place = this.place('-');
    for (const key of REQUIRED_TEXT_FIELDS) {
      if (!isFilled(data[key])) this.findings.push(warn(place, `top-level "${key}" missing`));
    }
    if ('group' in data) this.checkGroupLabel(place, data['group']);
    this.checkCourse(place, data['course']);
    const stem = this.file.replace(/\.json$/i, '');
    if (!isQuizId(stem)) {
      this.findings.push(
        error(
          place,
          `${MOCK_ONLY_PREFIX}the file name must make a quiz id (lowercase words joined by hyphens, 64 characters at most)`,
        ),
      );
    }
  }

  private checkGroupLabel(place: Place, label: unknown): void {
    const valid =
      isText(label) && label.trim() !== '' && label.trim().length <= GROUP_LABEL_MAX_LENGTH;
    if (valid) return;
    const message = `top-level "group" must be a non-empty text of at most ${String(GROUP_LABEL_MAX_LENGTH)} characters`;
    this.findings.push(error(place, message));
  }

  private checkCourse(place: Place, label: unknown): void {
    const { course } = this.input;
    if (course === undefined) return;
    const { short, code } = course;
    if (short !== '' && !this.file.startsWith(`${short}-`)) {
      const message = `file name must start with "${short}-" (the short name of course ${code})`;
      this.findings.push(error(place, message));
    }
    if (isText(label) && !label.toLowerCase().startsWith(code.toLowerCase())) {
      const message = `"course" is ${pythonRepr(label)} but the file is in course folder ${code}`;
      this.findings.push(warn(place, message));
    }
  }

  private checkIdPrefix(place: Place, id: unknown): void {
    const { course } = this.input;
    if (this.idPrefix === '' || !isText(id) || id === '' || id.startsWith(this.idPrefix)) return;
    const message = `id ${id} must start with "${this.idPrefix}" (course ${course?.code ?? ''})`;
    this.findings.push(error(place, message));
  }

  checkEntry(entry: unknown, number: number): void {
    this.entries += 1;
    const id = isObject(entry) ? entry['id'] : undefined;
    const where = isTruthy(id) ? String(id) : `#${String(number)}`;
    const place = this.place(where);
    if (!isObject(entry)) {
      this.findings.push(error(place, 'entry is not an object'));
      return;
    }
    this.checkId(place, id);
    const type = entry['type'];
    if (!ENTRY_TYPES.includes(type)) {
      this.findings.push(error(place, `unknown type ${pythonRepr(type)}`));
      return;
    }
    if (type === 'image-group') this.checkGroup(place, entry, id);
    else this.checkStandalone(place, entry, type);
  }

  private checkId(place: Place, id: unknown): void {
    if (!isText(id) || id === '') this.findings.push(error(place, 'missing id'));
    else if (this.seenIds.has(id)) this.findings.push(error(place, 'duplicate id'));
    this.checkIdPrefix(place, id);
    if (isText(id)) this.seenIds.add(id);
  }

  private checkPicture(place: Place, imagePath: unknown): void {
    const picture = checkImage(place, imagePath, this.input.images, this.seenImages);
    this.findings.push(...picture.findings);
    if (picture.resolved !== undefined) this.seenImages.add(picture.resolved);
  }

  private checkGroup(place: Place, group: JsonObject, id: unknown): void {
    this.groups += 1;
    const { parts } = group;
    this.checkPicture(place, group['image_path']);
    for (const stray of GROUP_ONLY_PLACES) {
      if (stray in group) {
        this.findings.push(warn(place, `group has a top-level "${stray}" (belongs on the parts)`));
      }
    }
    if (!isList(parts) || parts.length === 0) {
      this.findings.push(error(place, 'image-group needs a non-empty "parts" list'));
      return;
    }
    if (parts.length < PARTS_TARGET.min || parts.length > PARTS_TARGET.max) {
      const make = parts.length > PARTS_TARGET.max ? note : warn;
      const target = `${String(PARTS_TARGET.min)} to ${String(PARTS_TARGET.max)}`;
      this.findings.push(make(place, `${String(parts.length)} parts (target ${target})`));
    }
    this.checkParts(place.where, id, parts);
    this.findings.push(
      ...checkLeaks(this.file, place.where, parts.filter(isObject), this.input.strict),
    );
  }

  private checkParts(where: string, groupId: unknown, parts: readonly unknown[]): void {
    let previousNumber: number | undefined;
    parts.forEach((part, at) => {
      const place = this.place(`${where} p${String(at + 1)}`);
      if (!isObject(part)) {
        this.findings.push(error(place, 'part is not an object'));
        return;
      }
      this.scored += 1;
      previousNumber =
        this.checkPartId(place, part['id'], groupId, previousNumber) ?? previousNumber;
      this.findings.push(...checkQuestion(place, part, this.input.strict));
    });
  }

  /** Checks a part's id and returns its `_p<number>`, when it has one, so the numbers can be compared. */
  private checkPartId(
    place: Place,
    id: unknown,
    groupId: unknown,
    previous: number | undefined,
  ): number | undefined {
    if (!isText(id) || id === '') {
      this.findings.push(error(place, 'part has no id'));
      return undefined;
    }
    if (this.seenIds.has(id)) this.findings.push(error(place, `duplicate id ${id}`));
    this.checkIdPrefix(place, id);
    this.seenIds.add(id);
    if (!isText(groupId)) return undefined;
    const match = new RegExp(`^${escapeForRegExp(groupId)}_p(\\d+)$`).exec(id);
    if (match === null) {
      this.findings.push(warn(place, `part id ${id} is not ${groupId}_p<number>`));
      return undefined;
    }
    const number = Number(match[1]);
    if (previous !== undefined && number <= previous) {
      const message = `part id ${id} is not higher than the part before it (_p${String(previous)})`;
      this.findings.push(warn(place, message));
    }
    return number;
  }

  private checkStandalone(place: Place, entry: JsonObject, type: unknown): void {
    this.scored += 1;
    if (type === 'image') this.checkPicture(place, entry['image_path']);
    else if (isTruthy(entry['image_path'])) {
      this.findings.push(
        warn(
          place,
          'text question has an image_path (quiz.py shows it as an image question only when type is "image")',
        ),
      );
    }
    if ('parts' in entry) {
      this.findings.push(warn(place, `type ${pythonRepr(type)} entry has a "parts" list`));
    }
    this.findings.push(...checkQuestion(place, entry, this.input.strict));
    this.checkRepeatedText(place, entry['question']);
  }

  private checkRepeatedText(place: Place, question: unknown): void {
    if (!isText(question)) return;
    const key = normaliseText(question);
    const first = this.seenQuestionText.get(key);
    if (first === undefined) this.seenQuestionText.set(key, place.where);
    else {
      this.findings.push(
        warn(place, `same question text as ${first} (mixed-unit mode drops duplicates)`),
      );
    }
  }
}

/**
 * Checks one quiz file: its schema, the rules in the question guide, its pictures, and the file
 * name and ids against the course registry. A port of `validate_file` in the real validator.
 */
export function checkQuizFile(input: QuizFileInput): QuizFileResult {
  const place = { file: input.name, where: '-' };
  let data: unknown;
  try {
    data = JSON.parse(input.text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'not valid JSON';
    return { findings: [error(place, `cannot read JSON: ${reason}`)], stats: undefined, keys: [] };
  }
  if (!isObject(data) || !isList(data['questions'])) {
    const message = 'top level must be an object with a "questions" list';
    return { findings: [error(place, message)], stats: undefined, keys: [] };
  }
  const checker = new QuizFileChecker(input);
  checker.checkTopLevel(data);
  data['questions'].forEach((entry, at) => {
    checker.checkEntry(entry, at + 1);
  });
  return {
    findings: checker.findings,
    stats: checker.stats,
    keys: data['questions'].flatMap(entryKeys),
  };
}
