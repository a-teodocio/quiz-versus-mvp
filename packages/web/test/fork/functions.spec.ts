// The forked page's own shuffle, typed-answer and progress-key functions, run in the browser
// against the fixtures that were made by running the REAL app's functions (packages/core/test/
// fixtures/real-app/SOURCE.md). If the fork or the fixtures drift apart, one of these fails.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, openHome, test } from '../support/app.js';
import { partsOf, quizFile } from '../support/content.js';
import type { PageFunctions } from '../support/page-api.js';

const fixtureDir = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'core',
  'test',
  'fixtures',
  'real-app',
);
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));

interface ShuffleCase {
  name: string;
  options: string[];
  correct: number;
  randoms: number[];
  expectedOptions: string[];
  expectedCorrect: number;
}
interface TypedFixture {
  typedCases: {
    correct: string;
    tooLong: boolean;
    forms: string[] | null;
    checks: { text: string; ok: boolean; near: boolean }[];
  }[];
  normCases: { text: string; normalised: string }[];
  sameCases: { a: string; b: string; same: boolean }[];
  distanceCases: { a: string; b: string; distance: number }[];
}

test('shuffle: the page gives the real app’s order and maps the right answer', async ({ page }) => {
  await openHome(page);
  const cases = Object.values(fixture('shuffle.json') as Record<string, ShuffleCase>);
  expect(cases.length).toBeGreaterThan(3);
  for (const c of cases) {
    const got = await page.evaluate((input) => {
      const queue = [...input.randoms];
      Math.random = () => queue.shift() ?? 0;
      const api = window as unknown as PageFunctions;
      const shuffled = api.shuffleQuestion({
        type: 'text',
        options: input.options,
        correct: input.correct,
      });
      return { options: shuffled.options, correct: shuffled.shuffledCorrect };
    }, c);
    expect(got, c.name).toEqual({ options: c.expectedOptions, correct: c.expectedCorrect });
  }
});

test('typed answers: forms, length and verdicts match the real app', async ({ page }) => {
  await openHome(page);
  const { typedCases } = fixture('typed.json') as TypedFixture;
  for (const c of typedCases) {
    const got = await page.evaluate((input) => {
      const api = window as unknown as PageFunctions;
      return {
        tooLong: api.answerTooLong(input.correct),
        forms: api.answerForms(input.correct),
        checks: input.checks.map((k) => {
          const verdict = api.checkTyped(k.text, input.correct);
          return { text: k.text, ok: verdict.ok, near: verdict.near };
        }),
      };
    }, c);
    expect(got.tooLong, c.correct).toBe(c.tooLong);
    expect(got.forms, c.correct).toEqual(c.forms);
    expect(got.checks, c.correct).toEqual(c.checks);
  }
});

test('typed answers: normalising, plurals and edit distance match the real app', async ({
  page,
}) => {
  await openHome(page);
  const { normCases, sameCases, distanceCases } = fixture('typed.json') as TypedFixture;
  const got = await page.evaluate(
    (input) => {
      const api = window as unknown as PageFunctions;
      return {
        norm: input.normCases.map((k) => api.normTyped(k.text)),
        same: input.sameCases.map((k) => api.sameTyped(k.a, k.b)),
        distance: input.distanceCases.map((k) => api.editDistance(k.a, k.b)),
      };
    },
    { normCases, sameCases, distanceCases },
  );
  expect(got.norm).toEqual(normCases.map((k) => k.normalised));
  expect(got.same).toEqual(sameCases.map((k) => k.same));
  expect(got.distance).toEqual(distanceCases.map((k) => k.distance));
});

test('progress keys: the page and the quiz API make the same key for every fake entry', async ({
  page,
  request,
}) => {
  await openHome(page);
  const list = (await (await request.get('/api/list')).json()) as {
    file: string;
    keys: string[];
  }[];
  expect(list).toHaveLength(5);
  for (const item of list) {
    const entries = quizFile(item.file).questions;
    const fromPage = await page.evaluate((input) => {
      const api = window as unknown as PageFunctions;
      return input.flatMap((entry) => api.entryKeys(entry));
    }, entries as object[]);
    expect(fromPage, item.file).toEqual(item.keys);
    expect(item.keys, item.file).toHaveLength(partsOf(quizFile(item.file)).length);
  }
});

test('progress keys: an entry without an id falls back to its text, a group part to groupId#index', async ({
  page,
}) => {
  await openHome(page);
  const got = await page.evaluate(() => {
    const api = window as unknown as PageFunctions;
    return [
      api.entryKeys({ type: 'text', id: 'a1', question: 'Q?' }),
      api.entryKeys({ type: 'text', question: 'Only the text' }),
      api.entryKeys({ type: 'image-group', id: 'g1', parts: [{ id: 'p1' }, {}, { id: '' }] }),
      api.entryKeys({ type: 'image-group', parts: [{}] }),
    ];
  });
  expect(got).toEqual([['a1'], ['Only the text'], ['p1', 'g1#1', 'g1#2'], ['undefined#0']]);
});
