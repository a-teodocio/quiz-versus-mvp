import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_COURSE_CODE_LENGTH,
  MAX_QUIZ_LISTINGS,
  MAX_QUIZ_TITLE_LENGTH,
  MAX_SCORED_PARTS_PER_QUIZ,
} from '@quiz-versus/protocol';
import { fakeContentRoot } from '../../test/support/content-root.js';
import { MAX_QUIZ_FILE_BYTES } from '../config/defaults.js';
import { createDiskQuizRepository } from './disk-quiz-repository.js';
import { buildQuizCatalog, REST_OF_THE_FILES } from './quiz-catalog.js';

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

describe('the quiz catalog and the order of the list', () => {
  it('orders by code unit, the same on every machine: capitals first, a hyphen before a letter', async () => {
    const root = contentWith({
      'alpha/ab.json': GOOD,
      'alpha/a-b.json': GOOD,
      'Zeta/one.json': GOOD,
    });
    const { quizzes } = await createDiskQuizRepository(root).catalog();
    expect(quizzes.map(({ course, id }) => `${course}/${id}`)).toEqual([
      'Zeta/one',
      'alpha/a-b',
      'alpha/ab',
    ]);
  });
});

describe('the quiz catalog and titles', () => {
  it('falls back to the id for a title that is not text, blank or not allowed, and trims the rest', async () => {
    const bell = String.fromCharCode(7);
    const root = contentWith({
      'c1/bell.json': quiz({ title: `Bell${bell}` }),
      'c1/blank.json': quiz({ title: '   ' }),
      'c1/empty.json': quiz({ title: '' }),
      'c1/long.json': quiz({ title: 't'.repeat(MAX_QUIZ_TITLE_LENGTH + 1) }),
      'c1/null.json': quiz({ title: null }),
      'c1/number.json': quiz({ title: 7 }),
      'c1/padded.json': quiz({ title: '  Padded  ' }),
    });
    const { quizzes, skipped } = await createDiskQuizRepository(root).catalog();
    expect(skipped).toEqual([]);
    expect(Object.fromEntries(quizzes.map(({ id, title }) => [id, title]))).toEqual({
      bell: 'bell',
      blank: 'blank',
      empty: 'empty',
      long: 'long',
      null: 'null',
      number: 'number',
      padded: 'Padded',
    });
  });

  it('still loads a quiz whose title is not text, so the title never stops a game', async () => {
    const root = contentWith({ 'c1/odd.json': quiz({ title: { not: 'text' } }) });
    expect((await createDiskQuizRepository(root).load('odd'))?.entries).toHaveLength(1);
  });
});

describe('the quiz catalog and files it cannot list', () => {
  const noOptions = { ...QUESTION, options: ['a', 'b', 'c'] };
  const pointsNowhere = { ...QUESTION, correct: 9 };
  const group = { type: 'image-group', id: 'g', image_path: 'images/x.png' };

  it('names the files it leaves out, with a reason that does not quote them', async () => {
    const root = contentWith({
      'c1/fine.json': GOOD,
      'c1/broken.json': '{ SECRET-TEXT',
      'c1/huge.json': `${GOOD}${' '.repeat(MAX_QUIZ_FILE_BYTES)}`,
      'c1/empty.json': quiz({}, []),
      'c1/three-options.json': quiz({}, [QUESTION, noOptions]),
      'c1/bad-index.json': quiz({}, [pointsNowhere]),
      'c1/bad-part.json': quiz({}, [{ ...group, parts: [QUESTION, noOptions] }]),
      'c1/no-parts.json': quiz({}, [{ ...group, parts: [] }]),
    });
    const { quizzes, skipped } = await createDiskQuizRepository(root).catalog();
    expect(quizzes.map(({ id }) => id)).toEqual(['fine']);
    expect(new Map(skipped.map(({ id, reason }) => [id, reason]))).toEqual(
      new Map([
        ['broken', 'the file is not valid JSON'],
        ['huge', 'the file is too large'],
        ['empty', 'it has no questions'],
        ['three-options', 'a question needs exactly 4 options'],
        ['bad-index', 'a question has a correct index that points at no option'],
        ['bad-part', 'a question needs exactly 4 options'],
        ['no-parts', 'it has no questions'],
      ]),
    );
    expect(JSON.stringify(skipped)).not.toContain('SECRET-TEXT');
  });

  it('lists only quizzes that start a game: every listing passes the check a game makes', async () => {
    const root = contentWith({
      'c1/fine.json': GOOD,
      'c1/three-options.json': quiz({}, [noOptions]),
    });
    const repository = createDiskQuizRepository(root);
    const { quizzes } = await repository.catalog();
    expect(quizzes.map(({ id }) => id)).toEqual(['fine']);
    expect(repository.listQuizIds()).toEqual(['fine', 'three-options']);
  });

  it('leaves out a quiz whose course folder has a name the list does not allow', async () => {
    const longName = 'c'.repeat(MAX_COURSE_CODE_LENGTH + 1);
    const root = contentWith({ [`${longName}/fine.json`]: GOOD, 'c1/other.json': GOOD });
    const { quizzes, skipped } = await createDiskQuizRepository(root).catalog();
    expect(quizzes.map(({ id }) => id)).toEqual(['other']);
    expect(skipped).toEqual([
      { id: 'fine', reason: 'its course is not a name the quiz list allows' },
    ]);
  });
});

describe('the quiz catalog and a full list', () => {
  it('stops reading at the most quizzes the list allows and counts the rest in one entry', async () => {
    const files: Record<string, string> = {};
    for (let n = 0; n < MAX_QUIZ_LISTINGS + 3; n += 1) {
      const broken = n >= MAX_QUIZ_LISTINGS;
      files[`c1/quiz-${String(n).padStart(4, '0')}.json`] = broken ? '{ not read' : GOOD;
    }
    const { quizzes, skipped } = await createDiskQuizRepository(contentWith(files)).catalog();
    expect(quizzes).toHaveLength(MAX_QUIZ_LISTINGS);
    expect(skipped).toEqual([
      {
        id: REST_OF_THE_FILES,
        reason: '3 more files, left unread because the list holds 200',
      },
    ]);
  });
});

describe('the quiz catalog and a quiz with too many questions', () => {
  const entry = (n: number) => ({ ...QUESTION, type: 'text' as const, id: `q${String(n)}` });
  const quizOf = (count: number) => ({
    quiz: { id: 'big', entries: Array.from({ length: count }, (_, n) => entry(n)) },
    title: undefined,
  });
  const files = new Map([['big', { path: 'unused', course: 'c1' }]]);

  it('leaves out a quiz with more scored parts than the list can show, and says why', async () => {
    const { quizzes, skipped } = await buildQuizCatalog(files, () =>
      Promise.resolve(quizOf(MAX_SCORED_PARTS_PER_QUIZ + 1)),
    );
    expect(quizzes).toEqual([]);
    expect(skipped).toEqual([
      { id: 'big', reason: 'it has more questions than the list can show' },
    ]);
  });

  it('lists a quiz with exactly the most scored parts the list allows', async () => {
    const { quizzes, skipped } = await buildQuizCatalog(files, () =>
      Promise.resolve(quizOf(MAX_SCORED_PARTS_PER_QUIZ)),
    );
    expect(skipped).toEqual([]);
    expect(quizzes).toEqual([
      { id: 'big', course: 'c1', title: 'big', scoredParts: MAX_SCORED_PARTS_PER_QUIZ },
    ]);
  });
});
