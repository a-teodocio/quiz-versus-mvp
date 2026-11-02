/** How many leading bytes the validator needs from a picture: the PNG signature and its header. */
export const IMAGE_HEAD_BYTES = 32;

/**
 * Where pictures come from. Owned by the validator so it stays free of the file system; a disk
 * adapter (`readContentTree`) and the tests supply it.
 */
export interface ImageSource {
  /**
   * The first `IMAGE_HEAD_BYTES` bytes of the picture at this path (relative to the content
   * folder, always under `images/`), or undefined when there is no such file.
   */
  fileHead(path: string): Uint8Array | undefined;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_HEADER_NAME = [0x49, 0x48, 0x44, 0x52];
const PNG_HEADER_NAME_AT = 12;
const PNG_WIDTH_AT = 16;

const startsWith = (bytes: Uint8Array, at: number, expected: readonly number[]): boolean =>
  expected.every((byte, offset) => bytes[at + offset] === byte);

/**
 * The width in pixels of a PNG, read from its header, or undefined for anything else. The real
 * validator asks Pillow for any image type; only PNG is read here (docs/fidelity.md).
 */
export function pngWidth(head: Uint8Array): number | undefined {
  if (
    !startsWith(head, 0, PNG_SIGNATURE) ||
    !startsWith(head, PNG_HEADER_NAME_AT, PNG_HEADER_NAME)
  ) {
    return undefined;
  }
  const [a = 0, b = 0, c = 0, d = 0] = head.subarray(PNG_WIDTH_AT, PNG_WIDTH_AT + 4);
  return a * 2 ** 24 + b * 2 ** 16 + c * 2 ** 8 + d;
}
