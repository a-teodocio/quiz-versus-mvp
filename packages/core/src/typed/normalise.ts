/** Text comparison for typed answers. Ports of `normTyped`, `sameTyped` and `editDistance`. */

const COMBINING_MARKS = /[\u0300-\u036F]/g;
const APOSTROPHES = /['\u2018\u2019\u02BC`\u00B4]/g;
const HYPHENS = /[-\u2010-\u2015]/g;

/**
 * Capitals, accents, apostrophes (any style, present or not), hyphen against space, extra spaces
 * and a leading the, a or an do not matter; letters do.
 */
export function normaliseTyped(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(HYPHENS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

/** Equal, or equal apart from a plural ending on the last word (cell and cells). */
export function sameTyped(a: string, b: string): boolean {
  if (a === b) return true;
  const left = a.split(' ');
  const right = b.split(' ');
  if (left.length !== right.length) return false;
  const last = left.length - 1;
  if (left.slice(0, last).some((word, i) => word !== right[i])) return false;
  const x = left[last] ?? '';
  const y = right[last] ?? '';
  return x === `${y}s` || y === `${x}s` || x === `${y}es` || y === `${x}es`;
}

/** Number of single-letter edits (insert, delete, change) between two texts. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const swap = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, swap);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
