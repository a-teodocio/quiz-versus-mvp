import { error, warn } from '../findings/finding.js';
import type { Finding, Place } from '../findings/finding.js';
import { isObject, isText, isWholeNumber, pythonRepr } from '../json/json-values.js';
import type { JsonObject } from '../json/json-values.js';
import { ANSWER_MODES } from './registry.js';
import type { RegistryRead } from './registry.js';

/** The registry's own file name, used as the "file" of its findings. */
export const REGISTRY_FILE = 'courses.json';

const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHORT_PATTERN = /^[a-z0-9]+$/;

interface Seen {
  readonly codes: Set<string>;
  readonly shorts: Map<string, string>;
}

function checkShort(place: Place, code: string, short: unknown, seen: Seen): Finding[] {
  if (!isText(short) || !SHORT_PATTERN.test(short)) {
    return [
      error(
        place,
        `"short" must be lowercase letters and digits, the file-name and id prefix (got ${pythonRepr(short)})`,
      ),
    ];
  }
  const owner = seen.shorts.get(short);
  if (owner !== undefined) {
    return [error(place, `"short" ${pythonRepr(short)} is also used by ${owner}`)];
  }
  seen.shorts.set(short, code);
  return [];
}

function checkNameAndOrder(place: Place, item: JsonObject): Finding[] {
  const { name, order } = item;
  const findings: Finding[] = [];
  if (!isText(name) || name.trim() === '') {
    findings.push(error(place, '"name" must be non-empty text'));
  }
  if (!isWholeNumber(order)) findings.push(error(place, '"order" must be a whole number'));
  return findings;
}

/** The fields that may be left out but must be right when present. */
function checkOptionalFields(place: Place, item: JsonObject): Finding[] {
  const findings: Finding[] = [];
  for (const key of ['archived', 'legacy_ids']) {
    if (key in item && typeof item[key] !== 'boolean') {
      findings.push(error(place, `"${key}" must be true or false`));
    }
  }
  if ('term' in item && !isText(item['term'])) findings.push(error(place, '"term" must be text'));
  const answerBy = item['answer_by'];
  if ('answer_by' in item && !ANSWER_MODES.some((mode) => mode === answerBy)) {
    const allowed = ANSWER_MODES.join(', ');
    findings.push(
      error(place, `"answer_by" must be one of ${allowed} (got ${pythonRepr(answerBy)})`),
    );
  }
  return findings;
}

/** The findings for one registry entry; the code is added to `seen` unless it is unusable. */
function checkCourse(
  item: unknown,
  number: number,
  folders: ReadonlySet<string>,
  seen: Seen,
): Finding[] {
  const file = REGISTRY_FILE;
  if (!isObject(item))
    return [error({ file, where: `#${String(number)}` }, 'entry is not an object')];
  const code = item['code'];
  if (!isText(code) || !CODE_PATTERN.test(code)) {
    return [
      error(
        { file, where: `#${String(number)}` },
        `"code" must be lowercase letters, digits and hyphens, like the folder name (got ${pythonRepr(code)})`,
      ),
    ];
  }
  const place = { file, where: code };
  const findings: Finding[] = [];
  if (seen.codes.has(code)) findings.push(error(place, 'duplicate code'));
  seen.codes.add(code);
  findings.push(...checkShort(place, code, item['short'], seen));
  findings.push(...checkNameAndOrder(place, item));
  findings.push(...checkOptionalFields(place, item));
  if (!folders.has(code)) findings.push(warn(place, `no folder quizzes/${code}/`));
  return findings;
}

/**
 * The schema of `quizzes/courses.json`, and that it matches the course folders: every entry is
 * well formed, and every folder has an entry.
 */
export function checkRegistry(read: RegistryRead, courseFolders: readonly string[]): Finding[] {
  const folders = new Set(courseFolders);
  const seen: Seen = { codes: new Set(), shorts: new Map() };
  const file = REGISTRY_FILE;
  const findings: Finding[] = [];
  if (read.kind === 'broken') {
    findings.push(error({ file, where: '-' }, `cannot read the course registry: ${read.problem}`));
  }
  const list = read.kind === 'list' ? read.list : [];
  list.forEach((item, at) => findings.push(...checkCourse(item, at + 1, folders, seen)));
  for (const folder of courseFolders) {
    if (!seen.codes.has(folder)) {
      findings.push(
        error({ file: folder, where: '-' }, `course folder has no entry in quizzes/${file}`),
      );
    }
  }
  return findings;
}
