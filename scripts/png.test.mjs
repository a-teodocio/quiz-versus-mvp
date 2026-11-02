import { Buffer } from 'node:buffer';
import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createCanvas, encodePng } from './png.mjs';

/** The chunks of a PNG file: type, data and the checksum stored after them. */
function chunksOf(file) {
  const chunks = [];
  let at = 8;
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    chunks.push({
      type: file.subarray(at + 4, at + 8).toString('ascii'),
      data: file.subarray(at + 8, at + 8 + length),
      checksum: file.readUInt32BE(at + 8 + length),
    });
    at += 12 + length;
  }
  return chunks;
}

describe('encodePng', () => {
  const canvas = createCanvas(5, 3, [10, 20, 30]);
  canvas.pixels.set([200, 100, 50], 3 * (1 * 5 + 2)); // the pixel at column 2, row 1
  const file = encodePng(canvas);

  it('starts with the PNG signature', () => {
    expect([...file.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('writes a header with the size, 8-bit RGB and no interlacing', () => {
    const [header] = chunksOf(file);
    expect(header?.type).toBe('IHDR');
    expect(header?.data.readUInt32BE(0)).toBe(5);
    expect(header?.data.readUInt32BE(4)).toBe(3);
    expect([...(header?.data.subarray(8) ?? [])]).toEqual([8, 2, 0, 0, 0]);
  });

  it('ends with IEND and every chunk carries a correct checksum', () => {
    const chunks = chunksOf(file);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (const chunk of chunks) {
      const body = Buffer.concat([Buffer.from(chunk.type, 'ascii'), chunk.data]);
      expect(chunk.checksum, chunk.type).toBe(crc32(body));
    }
  });

  it('holds the pixels, one unfiltered row at a time', () => {
    const idat = chunksOf(file).find((chunk) => chunk.type === 'IDAT');
    const raw = inflateSync(idat?.data ?? Buffer.alloc(0));
    expect(raw.length).toBe((5 * 3 + 1) * 3);
    expect(raw[0]).toBe(0);
    const second = raw.subarray(16, 32);
    expect([...second.subarray(0, 4)]).toEqual([0, 10, 20, 30]);
    expect([...second.subarray(7, 10)]).toEqual([200, 100, 50]);
  });

  it('gives the same bytes for the same picture', () => {
    expect(encodePng(canvas).equals(file)).toBe(true);
  });
});
