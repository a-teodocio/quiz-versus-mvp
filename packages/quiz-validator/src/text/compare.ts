const codePoints = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);

/** Orders text by code point, as Python compares strings (JavaScript's `<` compares UTF-16 units). */
export function compareCodePoints(a: string, b: string): number {
  const left = codePoints(a);
  const right = codePoints(b);
  const shared = Math.min(left.length, right.length);
  for (let at = 0; at < shared; at++) {
    const difference = (left[at] ?? 0) - (right[at] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}
