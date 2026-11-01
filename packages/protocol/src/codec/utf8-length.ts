const LAST_ONE_BYTE = 0x7f;
const LAST_TWO_BYTES = 0x7ff;
const LAST_THREE_BYTES = 0xffff;

/**
 * Size of `text` once encoded as UTF-8. Counted by hand because `core` and `protocol` may not
 * rely on `TextEncoder` (a DOM or Node type). Lone surrogates count as 3 bytes, as `TextEncoder`
 * replaces them with U+FFFD.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= LAST_ONE_BYTE) bytes += 1;
    else if (codePoint <= LAST_TWO_BYTES) bytes += 2;
    else if (codePoint <= LAST_THREE_BYTES) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}
