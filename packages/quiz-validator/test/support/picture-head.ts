import { IMAGE_HEAD_BYTES } from '../../src/images/image-source.js';

/** The first bytes of a PNG that is `width` pixels wide: its signature and the start of its header. */
export function pictureHead(width: number): Uint8Array {
  const head = new Uint8Array(IMAGE_HEAD_BYTES);
  head.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  head.set([0, 0, 0, 13], 8);
  head.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(head.buffer).setUint32(16, width);
  return head;
}
