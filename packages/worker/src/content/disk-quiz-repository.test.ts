import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeContentRoot } from '../../test/support/content-root.js';
import { MAX_QUIZ_FILE_BYTES } from '../config/defaults.js';
import { ContentError } from './content-error.js';
import { createDiskQuizRepository } from './disk-quiz-repository.js';

const GOOD = JSON.stringify({
  questions: [
    {
      type: 'text',
      id: 'x_01',
      question: 'Q?',
      options: ['a', 'b', 'c', 'd'],
      correct: 0,
      explanation: 'E.',
    },
  ],
});

const folders: string[] = [];

/** A throwaway content folder with `quizzes/<course>/<name>` files. */
function contentWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'quiz-versus-content-'));
  folders.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, 'quizzes', ...path.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('createDiskQuizRepository on the fake content', () => {
  const repository = createDiskQuizRepository(fakeContentRoot);

  it('lists every quiz file by its file name without .json', () => {
    expect(repository.listQuizIds()).toEqual([
      'birds-ch2-field-notes',
      'birds-w1-plumage',
      'birds-w2-calls',
      'rocks-w1-identification',
      'rocks-w2-lab-methods',
    ]);
  });

  it('loads each quiz with its id and entries', async () => {
    for (const id of repository.listQuizIds()) {
      const quiz = await repository.load(id);
      expect(quiz?.id).toBe(id);
      expect(quiz?.entries.length).toBeGreaterThan(0);
    }
  });

  it('returns undefined for a quiz that does not exist, whatever it is called', async () => {
    expect(await repository.load('no-such-quiz')).toBeUndefined();
    expect(await repository.load('../courses')).toBeUndefined();
    expect(await repository.load('')).toBeUndefined();
  });
});

describe('createDiskQuizRepository on odd folders', () => {
  it('leaves out files and folders the real server leaves out, and names that are not quiz ids', () => {
    const root = contentWith({
      'c1/good-one.json': GOOD,
      'c1/_draft.json': GOOD,
      'c1/Bad_Name.json': GOOD,
      'c1/notes.txt': 'not a quiz',
      '_hidden/other.json': GOOD,
      '.git/other.json': GOOD,
      'courses.json': '[]',
    });
    expect(createDiskQuizRepository(root).listQuizIds()).toEqual(['good-one']);
  });

  it('refuses to start when two courses hold the same quiz id', () => {
    const root = contentWith({ 'c1/same.json': GOOD, 'c2/same.json': GOOD });
    expect(() => createDiskQuizRepository(root)).toThrow(ContentError);
  });

  it('refuses a file that is not a quiz, and one that is too large', async () => {
    const root = contentWith({
      'c1/broken.json': '{ nope',
      'c1/huge.json': `${GOOD}${' '.repeat(MAX_QUIZ_FILE_BYTES)}`,
    });
    const repository = createDiskQuizRepository(root);
    await expect(repository.load('broken')).rejects.toThrow(ContentError);
    await expect(repository.load('huge')).rejects.toThrow(/too large/);
  });
});
