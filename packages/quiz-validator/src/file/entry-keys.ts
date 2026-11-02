import { isList, isObject, isTruthy, jsText } from '../json/json-values.js';

/**
 * The progress keys of one quiz entry: the id of a standalone question (its text when it has no
 * id), or the id of each part of an image-group (`<group id>#<n>` when a part has none). A port
 * of `entry_keys` in the real server, which must match `entryKeys()` in the real page. Odd values
 * are written as JavaScript would write them (a missing id is "undefined").
 */
export function entryKeys(entry: unknown): string[] {
  if (!isObject(entry)) return [];
  if (entry['type'] !== 'image-group') {
    return [jsText(isTruthy(entry['id']) ? entry['id'] : entry['question'])];
  }
  const parts = isList(entry['parts']) ? entry['parts'] : [];
  return parts.map((part, at) => {
    const own = isObject(part) ? part['id'] : undefined;
    return jsText(isTruthy(own) ? own : `${jsText(entry['id'])}#${String(at)}`);
  });
}
