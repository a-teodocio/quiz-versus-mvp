// "Answer by: Type" in the forked page: checked answers, near misses, self-graded answers, and the
// answers that stay multiple choice. The minerals course types by default; its questions come in a
// shuffled order, so each test skips ahead to the one it needs.
import type { Page } from '@playwright/test';
import { expect, openHome, questionOnScreen, startQuiz, stored, test } from '../support/app.js';
import { quizFile, tidy } from '../support/content.js';

const file = quizFile('rocks-w1-identification.json');
const TITLE = 'Pretend Minerals: Identification';

/** The text of the question with this id. */
function textOf(id: string): string {
  const part = file.questions.find((entry) => entry.id === id);
  if (part?.question === undefined) throw new Error(`No question ${id}`);
  return tidy(part.question);
}

/** Starts the identification quiz in the minerals course and skips ahead to a question. */
async function reach(page: Page, id: string): Promise<void> {
  await openHome(page);
  await page.locator('#courseSelect').selectOption('demo-2002');
  await startQuiz(page, TITLE);
  const target = textOf(id);
  for (let step = 0; step < 20; step += 1) {
    if ((await questionOnScreen(page)) === target) return;
    const skip = page.locator('#typeSkipBtn');
    if (await skip.isVisible()) await skip.click();
    else await page.locator('#optionsEl .option').first().click();
    await page.locator('#nextBtn').click();
  }
  throw new Error(`Never reached ${id}`);
}

const type = async (page: Page, text: string): Promise<void> => {
  await page.locator('#typeInput').fill(text);
  await page.keyboard.press('Enter');
};

test('typed: a right answer is accepted in any case, with its plural, and shown beside the answer', async ({
  page,
}) => {
  await reach(page, 'rocks_01');
  await expect(page.locator('#questionLabel')).toHaveText('Type your answer');
  await expect(page.locator('#optionsEl')).toBeHidden();
  await type(page, 'GLIMMERITES');
  await expect(page.locator('#feedbackVerdict')).toHaveText('✓ Correct!');
  await expect(page.locator('.typed-line').first()).toContainText('You typed');
  await expect(page.locator('.typed-line').nth(1)).toContainText('Glimmerite');
  await expect(page.locator('#typeInput')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#nextBtn')).toBeVisible();
  expect(await stored(page, 'mlsquiz_perf')).toMatchObject({ rocks_01: [1, 1] });
});

test('typed: one letter off is wrong, shows which letters, and can be counted as right', async ({
  page,
}) => {
  await reach(page, 'rocks_01');
  await type(page, 'Glimmerit');
  await expect(page.locator('#feedbackVerdict')).toHaveText('✗ Almost: check the spelling');
  await expect(page.locator('#feedbackEl')).toHaveClass(/incorrect/);
  await expect(page.locator('.d-fix')).toHaveText('e');
  expect(await stored(page, 'mlsquiz_perf')).toMatchObject({ rocks_01: [1, 0] });
  await page.locator('#typedRightBtn').click();
  await expect(page.locator('#feedbackVerdict')).toHaveText('✓ Marked as right');
  expect(await stored(page, 'mlsquiz_perf')).toMatchObject({ rocks_01: [1, 1] });
  await page.locator('#typedWrongBtn').click();
  await expect(page.locator('#feedbackVerdict')).toHaveText('✗ Marked as wrong');
  expect(await stored(page, 'mlsquiz_perf')).toMatchObject({ rocks_01: [1, 0] });
});

test('typed: a wrong answer is Incorrect', async ({ page }) => {
  await reach(page, 'rocks_01');
  await type(page, 'banana');
  await expect(page.locator('#feedbackVerdict')).toHaveText('✗ Incorrect');
  await expect(page.locator('.typed-val').first()).toHaveText('banana');
});

test('typed: markup typed into the box is shown as text, never run', async ({ page }) => {
  await reach(page, 'rocks_01');
  await type(page, '<b>bold</b><img src=x>');
  await expect(page.locator('.typed-val').first()).toHaveText('<b>bold</b><img src=x>');
  await expect(page.locator('.typed-val').first().locator('b, img')).toHaveCount(0);
});

test('typed: I don’t know counts as wrong and shows the answer', async ({ page }) => {
  await reach(page, 'rocks_01');
  await page.locator('#typeSkipBtn').click();
  await expect(page.locator('#feedbackVerdict')).toHaveText('✗ Incorrect');
  await expect(page.locator('.typed-val').first()).toHaveText('(no answer)');
  await expect(page.locator('.typed-val').nth(1)).toHaveText('Glimmerite');
});

test('typed: a bracketed answer accepts the short form, the full form and the name in brackets', async ({
  page,
}) => {
  await reach(page, 'rocks_03');
  await type(page, 'oq');
  await expect(page.locator('#feedbackVerdict')).toHaveText('✓ Correct!');
});

test('typed: a bracketed word in the middle may be left out', async ({ page }) => {
  await reach(page, 'rocks_07');
  await type(page, 'Loose tuff');
  await expect(page.locator('#feedbackVerdict')).toHaveText('✓ Correct!');
});

test('typed: an answer with digits is marked by the player, with the keys 1 and 2', async ({
  page,
}) => {
  await reach(page, 'rocks_08');
  await type(page, 'grade four');
  await expect(page.locator('#feedbackVerdict')).toHaveText(
    'Compare with the answer, then mark yourself',
  );
  await expect(page.locator('#typedRightBtn')).toHaveText('✓ I got it right (1)');
  await expect(page.locator('#typedWrongBtn')).toHaveText('✗ I got it wrong (2)');
  await page.keyboard.press('2');
  await expect(page.locator('#feedbackVerdict')).toHaveText('✗ Marked as wrong');
  expect(await stored(page, 'mlsquiz_perf')).toMatchObject({ rocks_08: [1, 0] });
});

test('typed: an answer of more than three words stays multiple choice and says why', async ({
  page,
}) => {
  await reach(page, 'rocks_11');
  await expect(page.locator('#questionLabel')).toHaveText(
    'Multiple choice · answer too long to type',
  );
  await expect(page.locator('#optionsEl .option')).toHaveCount(4);
  await expect(page.locator('#typeWrap')).toBeHidden();
});

test('typed: digit keys go into the box and do not answer', async ({ page }) => {
  await reach(page, 'rocks_08');
  await page.locator('#typeInput').focus();
  await page.keyboard.press('1');
  await expect(page.locator('#typeInput')).toHaveValue('1');
  await expect(page.locator('#feedbackEl')).toBeHidden();
});

test('typed: in exam mode an answer that needs marking by hand is asked as multiple choice', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  await page.locator('#courseSelect').selectOption('demo-2002');
  await page.locator('#modeOptions .t-opt', { hasText: 'Exam' }).click();
  await startQuiz(page, TITLE);
  const target = textOf('rocks_08');
  for (let step = 0; step < 17; step += 1) {
    const current = await questionOnScreen(page);
    if (current === target) break;
    if (await page.locator('#typeWrap').isVisible()) await type(page, 'x');
    else await page.locator('#optionsEl .option').first().click();
    await expect(page.locator('#progressText')).not.toHaveText(
      new RegExp(`^Question ${String(step + 1)} of`),
    );
  }
  expect(await questionOnScreen(page)).toBe(target);
  await expect(page.locator('#optionsEl .option')).toHaveCount(4);
  await expect(page.locator('#typeWrap')).toBeHidden();
  // The real page says "answer too long to type" here, which is not why (docs/known-issues.md).
  await expect(page.locator('#questionLabel')).toHaveText(
    'Multiple choice · cannot be typed in exam mode',
  );
});
