// A minimal PNG writer (8-bit RGB, no interlacing) built on node:zlib, so the repo can generate
// fake pictures without an image library. Used by make-content-images.mjs and
// make-validator-fixtures.mjs.
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A blank picture filled with one colour. `rgb` is [r, g, b]. */
export function createCanvas(width, height, rgb) {
  const pixels = new Uint8Array(width * height * 3);
  for (let at = 0; at < pixels.length; at += 3) pixels.set(rgb, at);
  return { width, height, pixels };
}

/** The bytes of a PNG file for a canvas. The same canvas always gives the same bytes. */
export function encodePng({ width, height, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, no filter method, no interlace
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height); // each row starts with filter type 0
  for (let row = 0; row < height; row++) {
    raw.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
