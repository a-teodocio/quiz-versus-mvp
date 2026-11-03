// Exam mode, the End exam button and the timer in the forked page. Time is the browser's fake
// clock (`page.clock`), so no test waits for real minutes.
import {
  answerOnScreen,
  expect,
  openHome,
  playThrough,
  startQuiz,
  stored,
  test,
} from '../support/app.js';
import { quizFile } from '../support/content.js';

const TITLE = 'Imaginary Birds: Field Notes';
const TAB = 'Other';
const file = quizFile('birds-ch2-field-notes.json');

test('exam: no feedback, the pick moves on by itself, an earlier answer can be changed', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  await page.locator('#modeOptions .t-opt', { hasText: 'Exam' }).click();
  await startQuiz(page, TITLE, TAB);
  await expect(page.locator('#timerDisplay')).toHaveText('15:00');
  await answerOnScreen(page, file, 'wrong');
  await expect(page.locator('#progressText')).toHaveText('Question 2 of 6');
  await expect(page.locator('#feedbackEl')).toBeHidden();
  await expect(page.locator('#nextBtn')).toBeHidden();
  await page.locator('#backBtn').click();
  await expect(page.locator('#optionsEl .selected')).toHaveCount(1);
  await answerOnScreen(page, file, 'right');
  await expect(page.locator('#progressText')).toHaveText('Question 2 of 6');
  expect(Object.values((await stored(page, 'mlsquiz_perf')) as Record<string, number[]>)).toEqual([
    [1, 1],
  ]);
});

test('exam: the last question says Finish exam, and the results carry the exam badge', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  await page.locator('#modeOptions .t-opt', { hasText: 'Exam' }).click();
  await startQuiz(page, TITLE, TAB);
  for (let part = 0; part < 6; part += 1) await answerOnScreen(page, file, 'right');
  await expect(page.locator('#progressText')).toHaveText('Question 6 of 6');
  await expect(page.locator('#nextBtn')).toHaveText('Finish exam');
  await page.locator('#nextBtn').click();
  await expect(page.locator('#examBadge')).toBeVisible();
  await expect(page.locator('#scoreDisplay')).toHaveText('6/6');
});

test('End exam: asks first, names how many are unanswered, then opens the results', async ({
  page,
}) => {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  await playThrough(page, file, ['right', 'right']);
  await page.locator('#endExamBtn').click();
  await expect(page.locator('#endConfirmMsg')).toHaveText(
    '2 of 6 answered. The 4 unanswered questions will show in your results with the correct ' +
      'answer, marked Unanswered, and will not count as attempts.',
  );
  await page.locator('#endKeepBtn').click();
  await expect(page.locator('#resultsView')).toBeHidden();
  await page.locator('#endExamBtn').click();
  await page.locator('#endConfirm .btn-primary').click();
  await expect(page.locator('#scoreNote')).toHaveText(
    'Ended early: 4 unanswered: Review this unit.',
  );
  await expect(page.locator('#scoreDisplay')).toHaveText('2/6');
  await expect(page.locator('.res-badge.skip').first()).toHaveText('Unanswered');
  await expect(page.locator('#filterIncorrect')).toBeVisible();
});

test('timer: counts down, warns at half time and at three minutes, ends the quiz at zero', async ({
  page,
}) => {
  await page.clock.install();
  await openHome(page);
  await page.locator('#timerOptions .t-opt', { hasText: '15 min' }).click();
  await startQuiz(page, TITLE, TAB);
  await expect(page.locator('#timerDisplay')).toHaveText('15:00');
  await page.clock.runFor('07:30');
  await expect(page.locator('#timerDisplay')).toHaveText('07:30');
  await expect(page.locator('#timerToast')).toContainText('Half your time remaining');
  await page.clock.runFor('04:30');
  await expect(page.locator('#timerDisplay')).toHaveText('03:00');
  await expect(page.locator('#timerDisplay')).toHaveClass(/warning/);
  await expect(page.locator('#timerToast')).toContainText('3 minutes remaining');
  await page.clock.runFor('03:00');
  await expect(page.locator('#timeupModal')).toHaveClass(/active/);
  await page.locator('#timeupModal .btn-primary').click();
  await expect(page.locator('#scoreNote')).toHaveText('Time’s up: 6 unanswered: Review this unit.');
  await expect(page.locator('#scoreDisplay')).toHaveText('0/6');
});

test('timer: after time is up an answer is not taken', async ({ page }) => {
  await page.clock.install();
  await openHome(page);
  await page.locator('#timerOptions .t-opt', { hasText: '15 min' }).click();
  await startQuiz(page, TITLE, TAB);
  await page.clock.runFor('15:01');
  await expect(page.locator('#timeupModal')).toHaveClass(/active/);
  await page.keyboard.press('1');
  await expect(page.locator('#feedbackEl')).toBeHidden();
});

test('timer: the quiz shows its time left in the unfinished list after a reload', async ({
  page,
}) => {
  await page.clock.install();
  await openHome(page);
  await page.locator('#timerOptions .t-opt', { hasText: '15 min' }).click();
  await startQuiz(page, TITLE, TAB);
  await page.clock.runFor('01:00');
  await expect(page.locator('#timerDisplay')).toHaveText('14:00');
  await page.reload();
  await expect(page.locator('.resume-detail')).toContainText('14:00 left');
});
