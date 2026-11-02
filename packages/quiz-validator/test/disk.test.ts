import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IMAGE_HEAD_BYTES, readContentTree } from '../src/index.js';
import { pictureHead } from './support/picture-head.js';

/** A scratch content folder with every kind of file the real server tells apart. */
let root = '';
let outside = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'content-root-'));
  outside = mkdtempSync(join(tmpdir(), 'content-outside-'));
  const write = (path: string, content: string | Uint8Array): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  };
  write(join(root, 'quizzes', 'courses.json'), '[]');
  write(join(root, 'quizzes', 'a-course', 'one-w1-a.json'), '{"questions":[]}');
  write(join(root, 'quizzes', 'a-course', 'one-w1-b.json'), '{"questions":[]}');
  write(join(root, 'quizzes', 'a-course', '_draft.json'), '{}');
  write(join(root, 'quizzes', 'a-course', 'notes.txt'), 'not a quiz');
  write(join(root, 'quizzes', '_hidden', 'one-w1-z.json'), '{}');
  write(join(root, 'quizzes', '.cache', 'one-w1-z.json'), '{}');
  write(join(root, 'quizzes', 'stray.json'), '{}');
  write(join(root, 'quizzes', '_ignored.json'), '{}');
  write(join(root, 'images', 'a-course', 'ok.png'), pictureHead(480));
  write(join(root, 'secret.png'), pictureHead(480));
  write(join(outside, 'secret.png'), pictureHead(480));
  mkdirSync(join(root, 'images', 'a-course', 'folder.png'));
  symlinkSync(outside, join(root, 'images', 'escape'), 'junction');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('readContentTree', () => {
  it('finds quizzes one folder down, as the real server does', () => {
    const tree = readContentTree(root);
    expect(tree.courseFolders).toEqual(['a-course']);
    expect(tree.quizFiles.map((file) => `${file.course}/${file.name}`)).toEqual([
      'a-course/one-w1-a.json',
      'a-course/one-w1-b.json',
    ]);
    expect(tree.quizFiles[0]?.text).toBe('{"questions":[]}');
  });

  it('reports a JSON file loose in quizzes/ but not the registry or a hidden file', () => {
    expect(readContentTree(root).looseQuizFileNames).toEqual(['stray.json']);
  });

  it('reads the registry text, or says there is none', () => {
    expect(readContentTree(root).registryText).toBe('[]');
    const bare = mkdtempSync(join(tmpdir(), 'content-bare-'));
    try {
      mkdirSync(join(bare, 'quizzes'));
      expect(readContentTree(bare).registryText).toBeUndefined();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('gives the first bytes of a picture, no more than the validator needs', () => {
    const head = readContentTree(root).images.fileHead('images/a-course/ok.png');
    expect(head?.length).toBeLessThanOrEqual(IMAGE_HEAD_BYTES);
    expect(head?.slice(0, 4)).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('gives nothing for a missing picture or a folder', () => {
    const { images } = readContentTree(root);
    expect(images.fileHead('images/a-course/missing.png')).toBeUndefined();
    expect(images.fileHead('images/a-course/folder.png')).toBeUndefined();
  });

  it('gives nothing for a picture reached through a link that leaves the images folder', () => {
    const { images } = readContentTree(root);
    expect(images.fileHead('images/escape/secret.png')).toBeUndefined();
  });
});
