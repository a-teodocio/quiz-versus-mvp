import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeContentRoot } from '../../test/support/content-root.js';
import { MAX_IMAGE_BYTES } from '../config/defaults.js';
import { createImageStore } from './image-store.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const folders: string[] = [];

function scratchFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'quiz-versus-images-'));
  folders.push(folder);
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('createImageStore on the fake content', () => {
  const store = createImageStore(fakeContentRoot);

  it('reads a picture and says what type it is', async () => {
    const image = await store.read('images/demo-1001/feather-bands.png');
    expect(image?.contentType).toBe('image/png');
    expect([...(image?.bytes.subarray(0, 4) ?? [])]).toEqual(PNG_SIGNATURE);
  });

  it.each([
    ['a file that does not exist', 'images/demo-1001/missing.png'],
    ['a path that climbs out', 'images/../quizzes/courses.json'],
    ['a path that climbs out of a course', 'images/demo-1001/../../quizzes/courses.json'],
    ['a quiz file', 'quizzes/demo-1001/birds-w1-plumage.json'],
    ['the registry', 'quizzes/courses.json'],
    ['a folder', 'images/demo-1001'],
    ['a file that is not a picture', 'images/demo-1001/feather-bands.json'],
    ['an absolute path', '/etc/passwd'],
    ['a backslash path', 'images\\demo-1001\\feather-bands.png'],
    ['an encoded dot segment', 'images/%2e%2e/quizzes/courses.json'],
    ['a path outside images', 'content/images/demo-1001/feather-bands.png'],
    ['an empty path', ''],
  ])('refuses %s', async (_name, path) => {
    expect(await store.read(path)).toBeUndefined();
  });
});

describe('createImageStore containment', () => {
  it('refuses a link inside images that leads outside it', async () => {
    const root = scratchFolder();
    const outside = scratchFolder();
    writeFileSync(join(outside, 'secret.png'), 'not really a picture');
    mkdirSync(join(root, 'images'));
    // A junction works without special rights on Windows; elsewhere it is an ordinary link.
    symlinkSync(outside, join(root, 'images', 'escape'), 'junction');
    expect(await createImageStore(root).read('images/escape/secret.png')).toBeUndefined();
  });

  it('refuses a picture that is too large', async () => {
    const root = scratchFolder();
    mkdirSync(join(root, 'images', 'c'), { recursive: true });
    writeFileSync(join(root, 'images', 'c', 'big.png'), Buffer.alloc(MAX_IMAGE_BYTES + 1));
    writeFileSync(join(root, 'images', 'c', 'ok.png'), Buffer.alloc(10));
    const store = createImageStore(root);
    expect(await store.read('images/c/big.png')).toBeUndefined();
    expect(await store.read('images/c/ok.png')).toBeDefined();
  });
});
