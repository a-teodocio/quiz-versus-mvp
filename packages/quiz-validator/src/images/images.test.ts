import { describe, expect, it } from 'vitest';
import { resolveImagePath, suffixOf } from './image-path.js';
import { pngWidth } from './image-source.js';

describe('resolveImagePath', () => {
  it.each<[string, string, string]>([
    ['a path under images', 'images/c1/a.png', 'images/c1/a.png'],
    ['back slashes', 'images\\c1\\a.png', 'images/c1/a.png'],
    ['dots that stay inside', 'images/c1/../c1/./a.png', 'images/c1/a.png'],
    ['doubled slashes', 'images//c1///a.png', 'images/c1/a.png'],
    ['an upper-case extension', 'images/c1/a.PNG', 'images/c1/a.PNG'],
    ['every served type', 'images/a.webp', 'images/a.webp'],
  ])('accepts %s', (_name, path, resolved) => {
    expect(resolveImagePath(path)).toEqual({ ok: true, path: resolved });
  });

  it.each<[string, string, string]>([
    ['a leading slash', '/images/a.png', 'absolute paths are not allowed'],
    ['a drive letter', 'C:\\images\\a.png', 'absolute paths are not allowed'],
    ['a null byte', 'images/a\0.png', 'absolute paths are not allowed'],
    ['a climb out of images', 'images/../a.png', 'path escapes the images folder'],
    ['a climb past the start', 'images/../../a.png', 'path escapes the images folder'],
    ['the folder itself', 'images', 'path escapes the images folder'],
    ['the folder with a dot', 'images/.', 'path escapes the images folder'],
    ['an unserved type', 'images/a.svg', "unsupported image extension '.svg'"],
    ['no extension', 'images/a', "unsupported image extension ''"],
    ['a hidden file with no extension', 'images/.png', "unsupported image extension ''"],
  ])('refuses %s', (_name, path, problem) => {
    expect(resolveImagePath(path)).toEqual({ ok: false, problem });
  });

  it.each(['slides/a.png', 'imagesx/a.png', '../images/a.png', 'a.png'])(
    'refuses %s, which is outside the only root the mock has',
    (path) => {
      const result = resolveImagePath(path);
      expect(result.ok).toBe(false);
      expect(result.ok ? '' : result.problem).toContain('pictures live under images/ only');
    },
  );
});

describe('suffixOf', () => {
  it.each<[string, string]>([
    ['a.png', '.png'],
    ['a.b.tar', '.tar'],
    ['.hidden', ''],
    ['name.', ''],
    ['plain', ''],
    ['images/c1/a.png', '.png'],
    ['images/v1.2/a', ''],
    ['images/.png', ''],
  ])('%s gives %j', (name, suffix) => {
    expect(suffixOf(name)).toBe(suffix);
  });
});

describe('pngWidth', () => {
  const header = (width: number): Uint8Array => {
    const bytes = new Uint8Array(32);
    bytes.set([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    ]);
    new DataView(bytes.buffer).setUint32(16, width);
    return bytes;
  };

  it.each([1, 300, 480, 65_536, 4_000_000_000])('reads a width of %d', (width) => {
    expect(pngWidth(header(width))).toBe(width);
  });

  it('gives nothing for a file that is not a PNG', () => {
    expect(pngWidth(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBeUndefined();
    expect(pngWidth(new Uint8Array(32))).toBeUndefined();
    expect(pngWidth(new Uint8Array(0))).toBeUndefined();
  });

  it('gives nothing when the header chunk is not named IHDR', () => {
    const bytes = header(500);
    bytes.set([0x49, 0x44, 0x41, 0x54], 12);
    expect(pngWidth(bytes)).toBeUndefined();
  });
});
