// The forked page's home screen: courses, unit tabs, settings, theme, mixing and chapter cards.
import { expect, openHome, quizRow, stored, storedText, test } from '../support/app.js';

const summary = 'Starting with: All · No timer · All · Unseen first';

test('home: lists the courses, and the first course’s unit tabs in the server’s order', async ({
  page,
}) => {
  await openHome(page);
  await expect(page.locator('#courseSelect option')).toHaveText([
    'Imaginary Birds',
    'Pretend Minerals',
  ]);
  await expect(page.locator('#unitTabs .t-opt')).toHaveText(['Week 2', 'Starter pack', 'Other']);
  await expect(page.locator('#unitTabs .t-opt').first()).toHaveAttribute('aria-pressed', 'true');
  const rows = page.locator('#quizList .quiz-item:visible');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Imaginary Birds: Calls and Songs');
  await expect(rows).toContainText('Week 2: Calls · 7 questions · 7 unseen');
});

test('home: a course brings its own units and its default Answer by', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('#answerOptions .t-opt.on')).toHaveText('Pick');
  await page.locator('#courseSelect').selectOption('demo-2002');
  await expect(page.locator('#unitTabs .t-opt')).toHaveText(['Week 1', 'Week 2']);
  await expect(page.locator('#answerOptions .t-opt.on')).toHaveText('Type');
  await expect(page.locator('#settingsSummary')).toContainText('Typing');
  await page.locator('#courseSelect').selectOption('demo-1001');
  await expect(page.locator('#answerOptions .t-opt.on')).toHaveText('Pick');
});

test('home: the settings summary follows the controls', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('#settingsSummary')).toHaveText(summary);
  await page.locator('#timerOptions .t-opt', { hasText: '30 min' }).click();
  await page.locator('#countPresets .t-opt', { hasText: '20' }).click();
  await page.locator('#orderOptions .t-opt', { hasText: 'Random' }).click();
  await expect(page.locator('#settingsSummary')).toContainText(
    'Starting with: 20 questions (about',
  );
  await expect(page.locator('#settingsSummary')).toContainText('30 min · All · Random');
  await page.locator('#modeOptions .t-opt', { hasText: 'Exam' }).click();
  await expect(page.locator('#settingsSummary')).toContainText('Exam mode');
  await expect(page.locator('#timerOptions .t-opt', { hasText: 'No timer' })).toBeDisabled();
});

test('home: choosing Exam with no timer sets 15 minutes', async ({ page }) => {
  await openHome(page);
  await page.locator('#modeOptions .t-opt', { hasText: 'Exam' }).click();
  await expect(page.locator('#timerOptions .t-opt.on')).toHaveText('15 min');
});

test('home: settings are remembered for each course, answer mode separately', async ({ page }) => {
  await openHome(page);
  await page.locator('#timerOptions .t-opt', { hasText: '45 min' }).click();
  await page.locator('#qCountInput').fill('30');
  await page.locator('#orderOptions .t-opt', { hasText: 'Random' }).click();
  await page.locator('#answerOptions .t-opt', { hasText: 'Type' }).click();
  await expect(page.locator('#countPresets .t-opt.on')).toHaveText('30');
  expect(await stored(page, 'mlsquiz_course_settings')).toEqual({
    'demo-1001': { timerSecs: 2700, dist: 'all', order: 'random', examMode: false, count: 30 },
  });
  expect(await stored(page, 'mlsquiz_answerby')).toEqual({ 'demo-1001': 'type' });

  await page.reload();
  await expect(page.locator('#timerOptions .t-opt.on')).toHaveText('45 min');
  await expect(page.locator('#qCountInput')).toHaveValue('30');
  await expect(page.locator('#answerOptions .t-opt.on')).toHaveText('Type');
  await page.locator('#courseSelect').selectOption('demo-2002');
  await expect(page.locator('#settingsSummary')).toContainText('Starting with: All · No timer');
});

test('home: Clear choices puts every setting back and says so', async ({ page }) => {
  await openHome(page);
  await page.locator('#timerOptions .t-opt', { hasText: '60 min' }).click();
  await page.locator('#distOptions .t-opt', { hasText: 'Balanced' }).click();
  await page.locator('#clearSettingsBtn').click();
  await expect(page.locator('#settingsSummary')).toHaveText(summary);
  await expect(page.locator('#timerToast')).toHaveText('Settings cleared');
});

test('home: progress starts empty, for the course and for all courses', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('#progressSummary')).toHaveText(
    'Imaginary Birds · Nothing answered yet.',
  );
  await expect(page.locator('#progressSummaryAll')).toHaveText(
    'All courses · Nothing answered on this device yet.',
  );
});

test('home: mixing needs two quizzes, keeps picks across tabs and starts a mixed quiz', async ({
  page,
}) => {
  await openHome(page);
  await page.locator('#mixToggleBtn').click();
  await expect(page.locator('#mixToggleBtn')).toHaveText('Cancel mixing');
  await expect(page.locator('#mixCount')).toHaveText('Pick at least 2 quizzes (0 selected)');
  await quizRow(page, 'Calls and Songs').click();
  await expect(page.locator('#mixStartBtn')).toBeDisabled();
  await page.locator('#unitTabs .t-opt', { hasText: 'Starter pack' }).click();
  await quizRow(page, 'Plumage').click();
  await expect(page.locator('#mixCount')).toHaveText('2 quizzes selected');
  await expect(page.locator('#unitTabs .t-opt', { hasText: 'Week 2' })).toHaveText('Week 2 · 1');
  await page.locator('#mixStartBtn').click();
  await expect(page.locator('#startConfirmMsg')).toContainText('Mixed units');
  await page.locator('#startConfirmBtn').click();
  await expect(page.locator('#unitLabel')).toHaveText('Mixed units');
  await expect(page.locator('#progressText')).toHaveText('Question 1 of 16');
});

test('home: files of one chapter fold into a card that remembers whether it is open', async ({
  page,
}) => {
  await page.route('**/api/list', async (route) => {
    const response = await route.fetch();
    const list = (await response.json()) as { chapter: string | null }[];
    const first = list.find((item) => item.chapter === 'ch2');
    const extra = { ...first, file: 'birds-ch2-terms.json', title: 'Imaginary Birds: Terms' };
    await route.fulfill({ response, json: [...list, extra] });
  });
  await openHome(page);
  await page.locator('#unitTabs .t-opt', { hasText: 'Other' }).click();
  const card = page.locator('.chapter-card:visible');
  await expect(card.locator('.chapter-title')).toHaveText('Imaginary Birds');
  await expect(card.locator('.chapter-meta')).toContainText('2 sets');
  await expect(card).toHaveClass(/collapsed/);
  await card.locator('.chapter-toggle').click();
  await expect(card.locator('.chapter-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.quiz-item')).toHaveText([/Field Notes/, /Terms/]);
  expect(await stored(page, 'mlsquiz_chapters_open')).toEqual(['demo-1001:ch2']);
});

test('theme: mode and palette apply at once, survive a reload and can be cleared', async ({
  page,
}) => {
  await openHome(page);
  await page.locator('#themeBtn').click();
  await page.locator('#themeMenu [data-mode="dark"]').click();
  await page.locator('#themeMenu [data-palette="sage"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'sage');
  await expect(page.locator('#themeMenu')).toBeHidden();
  expect(await storedText(page, 'mlsquiz_theme')).toBe('dark');
  expect(await storedText(page, 'mlsquiz_palette')).toBe('sage');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'sage');

  await page.locator('#themeBtn').click();
  await page.locator('#themeMenu [data-mode="system"]').click();
  await page.locator('#themeMenu [data-palette="classic"]').click();
  expect(await storedText(page, 'mlsquiz_theme')).toBeNull();
  expect(await storedText(page, 'mlsquiz_palette')).toBeNull();
});

test('theme: the menu opens with the arrow keys and Escape closes it', async ({ page }) => {
  await openHome(page);
  await page.locator('#themeBtn').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#themeMenu')).toBeVisible();
  await expect(page.locator('#themeBtn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#themeMenu [data-palette="classic"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#themeMenu')).toBeHidden();
  await expect(page.locator('#themeBtn')).toBeFocused();
});
