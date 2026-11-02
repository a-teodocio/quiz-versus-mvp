import type { GameSettings } from '@quiz-versus/protocol';
import { isFilled, isList, isObject, isText, isWholeNumber } from '../json/json-values.js';

/** How a course's questions are asked by default ("Answer by" in the real app); the game's own setting. */
export type AnswerMode = GameSettings['answerBy'];

/**
 * Every mode a registry may name. A record, so a mode added to the game's setting stops the build
 * here until it is listed (a plain list would accept any subset).
 */
const ANSWER_MODE_FLAGS: Readonly<Record<AnswerMode, true>> = { pick: true, type: true };

/** The modes as text, for messages. */
export const ANSWER_MODE_NAMES: readonly string[] = Object.keys(ANSWER_MODE_FLAGS);

export const isAnswerMode = (value: unknown): value is AnswerMode =>
  typeof value === 'string' && Object.hasOwn(ANSWER_MODE_FLAGS, value);

/** Where a course with no `order` sorts: after every numbered one. */
const UNREGISTERED_ORDER = 9999;

/** One course of the registry, every field defaulted as the real server defaults it. */
export interface CourseEntry {
  readonly code: string;
  readonly name: string;
  /** Prefix of the course's file names and ids. May be empty. */
  readonly short: string;
  readonly term: string;
  readonly archived: boolean;
  readonly order: number;
  /** Ids need not start with `short_` (old files). */
  readonly legacyIds: boolean;
  readonly answerBy: AnswerMode;
}

/** The registry file as read: its list, or why it could not be read, or neither if there is no file. */
export type RegistryRead =
  | { readonly kind: 'missing' }
  | { readonly kind: 'broken'; readonly problem: string }
  | { readonly kind: 'list'; readonly list: readonly unknown[] };

/** Parses the text of `quizzes/courses.json` (undefined when the file does not exist). */
export function readRegistry(text: string | undefined): RegistryRead {
  if (text === undefined) return { kind: 'missing' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    return { kind: 'broken', problem: cause instanceof Error ? cause.message : 'not valid JSON' };
  }
  if (!isList(data)) return { kind: 'broken', problem: 'top level must be a list of courses' };
  return { kind: 'list', list: data };
}

/** A registry object with every field defaulted, or undefined if it has no usable code. */
function courseFrom(raw: unknown): CourseEntry | undefined {
  if (!isObject(raw) || !isFilled(raw['code'])) return undefined;
  const code = raw['code'].trim();
  const { name, short, term, order, answer_by: answerBy } = raw;
  return {
    code,
    name: isFilled(name) ? name : code,
    short: isText(short) ? short.trim() : '',
    term: isText(term) ? term : '',
    archived: raw['archived'] === true,
    order: isWholeNumber(order) ? order : UNREGISTERED_ORDER,
    legacyIds: raw['legacy_ids'] === true,
    answerBy: isAnswerMode(answerBy) ? answerBy : 'pick',
  };
}

/** The courses by code. A missing or broken registry gives none, never an error; the first entry for a code wins. */
export function loadRegistry(read: RegistryRead): ReadonlyMap<string, CourseEntry> {
  const courses = new Map<string, CourseEntry>();
  if (read.kind !== 'list') return courses;
  for (const raw of read.list) {
    const course = courseFrom(raw);
    if (course !== undefined && !courses.has(course.code)) courses.set(course.code, course);
  }
  return courses;
}
