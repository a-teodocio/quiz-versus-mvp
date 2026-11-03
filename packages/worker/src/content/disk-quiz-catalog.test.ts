import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_QUIZ_LISTINGS, MAX_QUIZ_TITLE_LENGTH } from '@quiz-versus/protocol';
import { fakeContentRoot } from '../../test/support/content-root.js';
import { MAX_QUIZ_FILE_BYTES } from '../config/defaults.js';
import { createDiskQuizRepository } from './disk-quiz-repository.js';

const QUESTION = {
  type: 'text',
  id: 'x_01',
  question: 'Q?',
  options: ['a', 'b', 'c', 'd'],
  correct: 0,
  explanation: 'E.',
};

/** A quiz file's text, with the given top-level fields and questions. */
const quiz = (extra: Record<string, unknown> = {}, questions: unknown[] = [QUESTION]): string =>
  JSON.stringify({ ...extra, questions });

const GOOD = quiz();
const folders: string[] = [];

/** A throwaway content folder with `quizzes/<course>/<name>` files. */
function contentWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'quiz-versus-catalog-'));
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

describe('the quiz catalog of good files', () => {
  it('lists every quiz of the fake content, none skipped, the ids it can load', async () => {
    const repository = createDiskQuizRepository(fakeContentRoot);
    const { quizzes, skipped } = await repository.catalog();
    expect(skipped).toEqual([]);
    expect(quizzes.map(({ id }) => id).sort()).toEqual([...repository.listQuizIds()]);
    for (const listing of quizzes) {
      expect(listing.title.length).toBeGreaterThan(0);
      expect(listing.scoredParts).toBeGreaterThan(0);
    }
  });

  it('sorts by course and then id, and names the course folder', async () => {
    const root = contentWith({
      'zeta/a-one.json': GOOD,
      'alpha/z-last.json': GOOD,
      'alpha/b-first.json': GOOD,
    });
    const { quizzes } = await createDiskQuizRepository(root).catalog();
    expect(quizzes.map(({ course, id }) => `${course}/${id}`)).toEqual([
      'alpha/b-first',
      'alpha/z-last',
      'zeta/a-one',
    ]);
  });

  it('uses the title in the file, or the quiz id when the file has none', async () => {
    const root = contentWith({
      'c1/titled.json': quiz({ title: 'A Fine Title' }),
      'c1/untitled.json': GOOD,
    });
    const { quizzes } = await createDiskQuizRepository(root).catalog();
    expect(quizzes.map(({ id, title }) => [id, title])).toEqual([
      ['titled', 'A Fine Title'],
      ['untitled', 'untitled'],
    ]);
  });

  it('counts scored parts: a text question once, a picture group once per part', async () => {
    const part = (id: string): Record<string, unknown> => ({ ...QUESTION, id });
    const group = {
      type: 'image-group',
      id: 'g',
      image_path: 'images/x.png',
      parts: [part('a'), part('b'), part('c')],
    };
    const root = contentWith({ 'c1/mixed.json': quiz({}, [QUESTION, group]) });
    const { quizzes } = await createDiskQuizRepository(root).catalog();
    expect(quizzes[0]?.scoredParts).toBe(4);
  });

  it('reads the files once: a second call gives the same answer without looking again', async () => {
    const root = contentWith({ 'c1/one.json': GOOD });
    const repository = createDiskQuizRepository(root);
    const first = await repository.catalog();
    writeFileSync(join(root, 'quizzes', 'c1', 'one.json'), '{ changed');
    expect(await repository.catalog()).toBe(first);
  });
});

describe('the quiz catalog and files it cannot list', () => {
  it('names the files it leaves out, with a reason that does not quote them', async () => {
    const bell = String.fromCharCode(7);
    const root = contentWith({
      'c1/fine.json': GOOD,
      'c1/broken.json': '{ SECRET-TEXT',
      'c1/huge.json': `${GOOD}${' '.repeat(MAX_QUIZ_FILE_BYTES)}`,
      'c1/empty.json': quiz({}, []),
      'c1/odd-title.json': quiz({ title: `Bell${bell}` }),
      'c1/long-title.json': quiz({ title: 't'.repeat(MAX_QUIZ_TITLE_LENGTH + 1) }),
    });
    const { quizzes, skipped } = await createDiskQuizRepository(root).catalog();
    expect(quizzes.map(({ id }) => id)).toEqual(['fine']);
    const notAllowed = 'its course or title is not one the quiz list allows';
    expect(new Map(skipped.map(({ id, reason }) => [id, reason]))).toEqual(
      new Map([
        ['broken', 'the file is not valid JSON'],
        ['huge', 'the file is too large'],
        ['empty', 'it has no questions'],
        ['odd-title', notAllowed],
        ['long-title', notAllowed],
      ]),
    );
    expect(JSON.stringify(skipped)).not.toContain('SECRET-TEXT');
  });

  it('stops at the most quizzes the list allows and says which were left out', async () => {
    const files: Record<string, string> = {};
    for (let n = 0; n < MAX_QUIZ_LISTINGS + 2; n += 1) {
      files[`c1/quiz-${String(n).padStart(4, '0')}.json`] = GOOD;
    }
    const { quizzes, skipped } = await createDiskQuizRepository(contentWith(files)).catalog();
    expect(quizzes).toHaveLength(MAX_QUIZ_LISTINGS);
    expect(skipped.map(({ reason }) => reason)).toEqual([
      'the quiz list is full',
      'the quiz list is full',
    ]);
  });
});
