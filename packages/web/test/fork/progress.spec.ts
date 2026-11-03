// What the forked page remembers: progress per question, flags, the unfinished quiz, the recent
// sessions, and the copy and paste of progress between devices.
import {
  expect,
  openHome,
  playThrough,
  questionOnScreen,
  quizRow,
  skipTo,
  startQuiz,
  stored,
  test,
} from '../support/app.js';
import { findPart, partsOf, quizFile } from '../support/content.js';

const TITLE = 'Imaginary Birds: Field Notes';
const TAB = 'Other';
const file = quizFile('birds-ch2-field-notes.json');
const birdsParts = ['birds-ch2-field-notes.json', 'birds-w1-plumage.json', 'birds-w2-calls.json']
  .map((name) => partsOf(quizFile(name)).length)
  .reduce((a, b) => a + b, 0);

test('progress: each part counts under its own key, [answered, right]', async ({ page }) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  const played = await playThrough(page, file, [
    'right',
    'wrong',
    'right',
    'right',
    'wrong',
    'right',
  ]);
  const expected: Record<string, [number, number]> = {};
  for (const { question, which } of played) {
    const id = findPart(file, question).id ?? '';
    expected[id] = [1, which === 'right' ? 1 : 0];
  }
  expect(Object.keys(expected)).toHaveLength(6);
  expect(await stored(page, 'mlsquiz_perf')).toEqual(expected);
});

test('progress: the home page counts what was answered, per course and in all', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file);
  await page.locator('.results-footer .btn-primary').click();
  await expect(page.locator('#homeView')).toBeVisible();
  const left = birdsParts - 6;
  await expect(page.locator('#progressSummary')).toHaveText(
    `Imaginary Birds · Answered at least once: 6 of ${String(birdsParts)} questions ` +
      `(${String(left)} unseen). 100% correct over 6 answers.`,
  );
  await expect(page.locator('#progressSummaryAll')).toContainText(
    'All courses · Answered at least once: 6 of',
  );
  await page.locator('#unitTabs .t-opt', { hasText: TAB }).click();
  await expect(quizRow(page, TITLE)).toContainText('all answered');
});

test('flags: a plain question is flagged by its text, and Flag toggles', async ({ page }) => {
  const plain = file.questions.find((e) => e.type === 'text');
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await skipTo(page, plain?.question ?? '');
  await page.locator('#flagBtn').click();
  await expect(page.locator('#flagBtn')).toHaveText('⚑ Flagged');
  expect(await stored(page, 'mlsquiz_flags')).toEqual([plain?.question]);
  await page.locator('#flagBtn').click();
  await expect(page.locator('#flagBtn')).toHaveText('⚑ Flag');
  expect(await stored(page, 'mlsquiz_flags')).toEqual([]);
});

test('flags: a picture-group part is flagged by the group id', async ({ page }) => {
  const group = file.questions.find((e) => e.type === 'image-group');
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await skipTo(page, group?.parts?.[0]?.question ?? '');
  await page.locator('#flagBtn').click();
  expect(await stored(page, 'mlsquiz_flags')).toEqual([group?.id]);
});

test('flags: a flagged question can be redone from the results', async ({ page }) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await page.locator('#flagBtn').click();
  await playThrough(page, file);
  await expect(page.locator('#redoFlaggedBtn')).toBeVisible();
  await page.locator('#redoFlaggedBtn').click();
  await expect(page.locator('#startConfirmMsg')).toContainText('Redo flagged');
});

test('resume: leaving a quiz keeps it, Resume carries on with the score', async ({ page }) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file, ['right', 'wrong']);
  await page.locator('#exitBtn').click();
  await expect(page.locator('#exitConfirm')).toHaveClass(/active/);
  await page.locator('#exitConfirm .btn-secondary').click();
  await expect(page.locator('#quizView')).toBeVisible();
  await page.locator('#exitBtn').click();
  await page.locator('#exitConfirm .btn-primary').click();

  await expect(page.locator('#resumeCard')).toBeVisible();
  await expect(page.locator('.resume-title')).toHaveText(TITLE);
  await expect(page.locator('.resume-detail')).toContainText('Question 3 of 6');
  expect(await stored(page, 'mlsquiz_resume:demo-1001')).not.toBeNull();

  await page.locator('.resume-go').click();
  await expect(page.locator('#progressText')).toHaveText('Question 3 of 6');
  await playThrough(page, file, ['right', 'right', 'right', 'right']);
  await expect(page.locator('#scoreDisplay')).toHaveText('5/6');
  expect(await stored(page, 'mlsquiz_resume:demo-1001')).toBeNull();
});

test('resume: a reload in the middle of a quiz keeps it, and Discard drops it', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file, ['right']);
  await page.reload();
  await expect(page.locator('#resumeCard')).toBeVisible();
  await expect(page.locator('.resume-detail')).toContainText('Question 2 of 6');
  await page.locator('.resume-discard').click();
  await expect(page.locator('#resumeCard')).toBeHidden();
  expect(await stored(page, 'mlsquiz_resume:demo-1001')).toBeNull();
});

test('history: a finished session is listed with its score and can be viewed read-only', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file, ['right', 'right', 'right', 'right', 'wrong', 'right']);
  await page.locator('.results-footer .btn-primary').click();
  const row = page.locator('#historyList .hist-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.hist-title')).toHaveText(TITLE);
  await expect(row.locator('.hist-score')).toHaveText('83%5/6');
  await row.getByRole('button', { name: 'View' }).click();
  await expect(page.locator('#viewerNote')).toContainText('Saved results');
  await expect(page.locator('#viewerNote')).toContainText('read-only');
  await expect(page.locator('#scoreDisplay')).toHaveText('5/6');
  await expect(page.locator('#roundMenuWrap')).toBeHidden();
  await page.locator('.filter-row-right .btn-primary').click();
  await expect(page.locator('#homeView')).toBeVisible();
});

test('history: only the last three sessions are kept', async ({ page }) => {
  await openHome(page);
  for (let round = 0; round < 4; round += 1) {
    await startQuiz(page, TITLE, round === 0 ? TAB : undefined);
    await playThrough(page, file);
    await page.locator('.results-footer .btn-primary').click();
  }
  await expect(page.locator('#historyList .hist-row')).toHaveCount(3);
});

test('sync: copy, import (higher counts win, flags are added) and a two-click reset', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  const first = findPart(file, await questionOnScreen(page)).id ?? '';
  await playThrough(page, file, ['right']);
  await page.locator('#exitBtn').click();
  await page.locator('#exitConfirm .btn-primary').click();
  await page.locator('#progressOpenBtn').click();
  await page.locator('#progressCopyBtn').click();
  const text = await page.locator('#progressPaste').inputValue();
  expect(text.startsWith('MLSQUIZ1:')).toBe(true);
  expect(JSON.parse(text.slice('MLSQUIZ1:'.length))).toEqual({
    v: 1,
    p: { [first]: [1, 1] },
    f: [],
  });

  const incoming = { v: 1, p: { [first]: [3, 2], other_key: [1, 1] }, f: ['a flag'] };
  await page.locator('#progressPaste').fill(`MLSQUIZ1:${JSON.stringify(incoming)}`);
  await page.locator('#progressImportBtn').click();
  await expect(page.locator('#progressStatus')).toHaveText(
    'Imported: 1 new, 1 updated, 1 new flags.',
  );
  await page.locator('#progressImportBtn').click();
  await expect(page.locator('#progressStatus')).toHaveText(
    'Imported: 0 new, 0 updated, 0 new flags.',
  );
  expect(await stored(page, 'mlsquiz_perf')).toEqual({ [first]: [3, 2], other_key: [1, 1] });

  await page.locator('#progressPaste').fill('nonsense');
  await page.locator('#progressImportBtn').click();
  await expect(page.locator('#progressStatus')).toHaveText(
    'That does not look like progress copied from this app.',
  );
  await page.locator('#progressResetBtn').click();
  await expect(page.locator('#progressResetBtn')).toHaveText('Click again to erase');
  expect(await stored(page, 'mlsquiz_perf')).not.toEqual({});
  await page.locator('#progressResetBtn').click();
  await expect(page.locator('#progressStatus')).toHaveText('Progress cleared on this device.');
  expect(await stored(page, 'mlsquiz_perf')).toEqual({});
  expect(await stored(page, 'mlsquiz_flags')).toEqual(['a flag']);
});
