// Playing a standard quiz in the forked page: the start window, answering by click and by key,
// feedback, results and the redo buttons. The quiz is the small chapter file (5 entries, 6 parts).
import type { Page } from '@playwright/test';
import {
  answerOnScreen,
  expect,
  openHome,
  optionWith,
  playThrough,
  questionOnScreen,
  quizRow,
  startQuiz,
  test,
} from '../support/app.js';
import { findPart, quizFile, rightAnswer, tidy } from '../support/content.js';

const TITLE = 'Imaginary Birds: Field Notes';
const TAB = 'Other';
const file = quizFile('birds-ch2-field-notes.json');
const parts = 6;

test('start window: says what will be played, Cancel backs out, Enter starts', async ({ page }) => {
  await openHome(page);
  await page.locator('#unitTabs .t-opt', { hasText: TAB }).click();
  await quizRow(page, TITLE).click();
  await expect(page.locator('#startConfirm')).toHaveClass(/active/);
  await expect(page.locator('#startConfirmMsg')).toHaveText(
    `${TITLE} · No timer. 6 questions in 5 entries, about 3 min.`,
  );
  await page.locator('#startConfirm .btn-secondary').click();
  await expect(page.locator('#quizView')).toBeHidden();
  await quizRow(page, TITLE).click();
  await expect(page.locator('#startConfirm')).toHaveClass(/active/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#quizView')).toBeVisible();
  await expect(page.locator('#progressText')).toHaveText(`Question 1 of ${String(parts)}`);
  await expect(page.locator('#exitBtn')).toBeVisible();
});

test('answer: the right option is marked, the explanation follows, later clicks do nothing', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  const question = await questionOnScreen(page);
  const answer = await answerOnScreen(page, file, 'right');
  await expect(optionWith(page, answer)).toHaveClass(/correct-answer/);
  await expect(page.locator('#feedbackVerdict')).toHaveText('✓ Correct!');
  const explanation = tidy(findPart(file, question).explanation);
  await expect(page.locator('#feedbackText')).toHaveText(`${answer}: ${explanation}`);
  await expect(page.locator('#feedbackText strong')).toHaveText(answer);
  await expect(page.locator('#nextBtn')).toBeVisible();
  await page.locator('#optionsEl .option').filter({ hasNotText: answer }).first().click();
  await expect(page.locator('#optionsEl .wrong-answer')).toHaveCount(0);
});

test('answer: a wrong pick is marked wrong and the right option is shown', async ({ page }) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  const question = await questionOnScreen(page);
  const wrong = await answerOnScreen(page, file, 'wrong');
  await expect(optionWith(page, wrong)).toHaveClass(/wrong-answer/);
  await expect(optionWith(page, rightAnswer(file, question))).toHaveClass(/correct-answer/);
  await expect(page.locator('#feedbackVerdict')).toHaveText('✗ Incorrect');
  await expect(page.locator('#feedbackEl')).toHaveClass(/incorrect/);
});

/** Which option the player picked: the one marked wrong, else the one marked right. */
async function pickedIndex(page: Page): Promise<number> {
  return page.locator('#optionsEl .option').evaluateAll((options) => {
    const wrong = options.findIndex((o) => o.classList.contains('wrong-answer'));
    return wrong >= 0 ? wrong : options.findIndex((o) => o.classList.contains('correct-answer'));
  });
}

test('keys: 1 to 4 pick the first to fourth option, a second digit is ignored', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  for (const [index, key] of ['1', '2', '3', '4'].entries()) {
    await page.keyboard.press(key);
    expect(await pickedIndex(page), `key ${key}`).toBe(index);
    await page.keyboard.press(String(((index + 1) % 4) + 1));
    expect(await pickedIndex(page), `a second digit after ${key}`).toBe(index);
    await page.keyboard.press('Enter');
    await expect(page.locator('#progressText')).toHaveText(
      `Question ${String(index + 2)} of ${String(parts)}`,
    );
    await expect(page.locator('#nextBtn')).toBeHidden();
  }
});

test('keys: Space goes on to the next question like Enter', async ({ page }) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await page.keyboard.press('1');
  await page.keyboard.press(' ');
  await expect(page.locator('#progressText')).toHaveText(`Question 2 of ${String(parts)}`);
});

test('keys: digits do nothing on the home page or behind a window, and Escape closes it', async ({
  page,
}) => {
  await openHome(page);
  await page.keyboard.press('1');
  await expect(page.locator('#quizView')).toBeHidden();
  await startQuiz(page, TITLE, TAB);
  await page.locator('#exitBtn').click();
  await page.keyboard.press('1');
  await expect(page.locator('#feedbackEl')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#exitConfirm')).not.toHaveClass(/active/);
});

test('results: a clean run scores 100% and offers no redo', async ({ page }) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file);
  await expect(page.locator('#resultsView')).toBeVisible();
  await expect(page.locator('#scorePct')).toHaveText('100%');
  await expect(page.locator('#scoreDisplay')).toHaveText('6/6');
  await expect(page.locator('#scoreNote')).toHaveText('Great work!');
  await expect(page.locator('.res-card')).toHaveCount(5);
  await expect(page.locator('.res-card[data-status="correct"]')).toHaveCount(5);
  await expect(page.locator('#filterIncorrect')).toBeHidden();
  await expect(page.locator('#redoMissedBtn')).toBeHidden();
  await expect(page.locator('#redoFlaggedBtn')).toBeHidden();
  await expect(page.locator('.res-badge', { hasText: 'All Correct' })).toHaveCount(1);
});

test('results: misses are scored per part, can be filtered and redone', async ({ page }) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file, ['wrong', 'right', 'right', 'wrong', 'right', 'right']);
  await expect(page.locator('#scoreDisplay')).toHaveText('4/6');
  await expect(page.locator('#scorePct')).toHaveText('67%');
  await expect(page.locator('#scoreNote')).toHaveText('Keep studying.');
  const missed = await page.locator('.res-card:not([data-status="correct"])').count();
  expect(missed).toBeGreaterThan(0);
  await page.locator('#filterIncorrect').click();
  await expect(page.locator('.res-card:visible')).toHaveCount(missed);
  await page.locator('#filterAll').click();
  await expect(page.locator('.res-card:visible')).toHaveCount(5);
  await page.locator('#redoMissedBtn').click();
  await expect(page.locator('#startConfirmMsg')).toContainText('Redo missed/incorrect');
  await page.locator('#startConfirmBtn').click();
  await expect(page.locator('#quizView')).toBeVisible();
});

test('results: a low score says what to do, and the round menu starts a new quiz', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file, ['wrong', 'wrong', 'wrong', 'wrong', 'right', 'wrong']);
  await expect(page.locator('#scoreNote')).toHaveText('Review this unit.');
  await expect(page.locator('#scorePct')).toHaveClass(/lo/);
  await page.locator('#roundMenuBtn').click();
  await expect(page.locator('#roundMenuBtn')).toHaveAttribute('aria-expanded', 'true');
  await page
    .locator('#roundMenu', { hasText: 'Generate New Quiz' })
    .getByRole('menuitem')
    .first()
    .click();
  await expect(page.locator('#startConfirmMsg')).toContainText(TITLE);
  await page.locator('#startConfirmBtn').click();
  await expect(page.locator('#progressText')).toHaveText(`Question 1 of ${String(parts)}`);
});

test('navigation: Prev is off on the first question and returns to an answered one', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await expect(page.locator('#backBtn')).toBeDisabled();
  const first = await questionOnScreen(page);
  await playThrough(page, file, ['right']);
  await expect(page.locator('#backBtn')).toBeEnabled();
  await page.locator('#backBtn').click();
  expect(await questionOnScreen(page)).toBe(first);
  await expect(page.locator('#feedbackVerdict')).toHaveText('✓ Correct!');
  await expect(page.locator('#nextBtn')).toBeVisible();
});
