// Pictures in the forked page: a picture question, a picture group with parts, the zoom window
// and the notice for a picture that will not load.
import type { Page } from '@playwright/test';
import { expect, openHome, questionOnScreen, startQuiz, test } from '../support/app.js';
import { quizFile, tidy } from '../support/content.js';

const file = quizFile('birds-w1-plumage.json');
const TITLE = 'Imaginary Birds: Plumage';
const TAB = 'Starter pack';

/** The text of the question with this id, or of the first part of the group with this id. */
function textOf(id: string): string {
  const entry = file.questions.find((e) => e.id === id);
  const text = entry?.question ?? entry?.parts?.[0]?.question;
  if (text === undefined) throw new Error(`No question ${id}`);
  return tidy(text);
}

/** Starts the plumage quiz and answers (the first option) until the wanted question is on screen. */
async function reach(page: Page, id: string): Promise<void> {
  await openHome(page);
  await startQuiz(page, TITLE, TAB);
  const target = textOf(id);
  for (let step = 0; step < 9; step += 1) {
    if ((await questionOnScreen(page)) === target) return;
    await page.locator('#optionsEl .option').first().click();
    await page.locator('#nextBtn').click();
  }
  throw new Error(`Never reached ${id}`);
}

test('picture question: shows the picture from /image, loaded, with a text alternative', async ({
  page,
}) => {
  await reach(page, 'birds_05');
  await expect(page.locator('#imageWrap')).toBeVisible();
  const image = page.locator('#questionImage');
  await expect(image).toHaveAttribute('src', '/image?path=images%2Fdemo-1001%2Ffeather-bands.png');
  await expect(image).toHaveAttribute('alt', 'Question picture');
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
});

test('picture question: a text question hides the picture', async ({ page }) => {
  await reach(page, 'birds_01');
  await expect(page.locator('#imageWrap')).toBeHidden();
});

test('zoom: a click on the picture opens it large, Escape or the close button closes it', async ({
  page,
}) => {
  await reach(page, 'birds_05');
  await page.locator('#questionImage').click();
  await expect(page.locator('#zoomOverlay')).toHaveClass(/active/);
  await expect(page.locator('#zoomImg')).toHaveAttribute(
    'src',
    /\/image\?path=images%2Fdemo-1001%2Ffeather-bands\.png$/,
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('#zoomOverlay')).not.toHaveClass(/active/);
  await page.locator('#questionImage').click();
  await page.locator('.zoom-close').click();
  await expect(page.locator('#zoomOverlay')).not.toHaveClass(/active/);
});

test('zoom: digit keys do not answer while the picture is open', async ({ page }) => {
  await reach(page, 'birds_05');
  await page.locator('#questionImage').click();
  await page.keyboard.press('1');
  await expect(page.locator('#feedbackEl')).toBeHidden();
});

test('picture group: parts follow in order over one picture and count one by one', async ({
  page,
}) => {
  await reach(page, 'birds_group_01');
  const src = 'images%2Fdemo-1001%2Fflock-silhouettes.png';
  await expect(page.locator('#questionLabel')).toHaveText('Part 1 of 3');
  await expect(page.locator('#questionImage')).toHaveAttribute('src', `/image?path=${src}`);
  const first = await page.locator('#progressText').textContent();
  await page.locator('#optionsEl .option').first().click();
  await page.locator('#nextBtn').click();
  await expect(page.locator('#questionLabel')).toHaveText('Part 2 of 3');
  await expect(page.locator('#questionImage')).toHaveAttribute('src', `/image?path=${src}`);
  expect(await page.locator('#progressText').textContent()).not.toBe(first);
});

test('picture: one that will not load is replaced by a notice with its file name', async ({
  page,
}) => {
  // Only this picture is refused.
  await page.route('**/image?path=images%2Fdemo-1001%2Ffeather-bands.png', (route) =>
    route.fulfill({ status: 404 }),
  );
  await reach(page, 'birds_05');
  await expect(page.locator('#imageWrap')).toContainText('Image not available');
  await expect(page.locator('#imageWrap')).toContainText('feather-bands.png');
});

test('picture: after one that will not load, the next picture is drawn as usual', async ({
  page,
}) => {
  // The real page swaps the failed <img> for the notice, so its next picture question throws
  // (docs/known-issues.md). Here the element stays, hidden, and the notice goes with the question.
  await page.route('**/image?path=images%2Fdemo-1001%2Ffeather-bands.png', (route) =>
    route.fulfill({ status: 404 }),
  );
  await reach(page, 'birds_05');
  await expect(page.locator('#imageWrap')).toContainText('Image not available');
  const image = page.locator('#questionImage');
  await expect(image).toBeHidden();
  let drawn = false;
  for (let step = 0; step < 8 && !drawn; step += 1) {
    await page.locator('#optionsEl .option').first().click();
    await page.locator('#nextBtn').click();
    drawn = await image.isVisible();
  }
  expect(drawn).toBe(true);
  await expect(page.locator('#imageWrap')).not.toContainText('Image not available');
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
});

test('results: pictures are shown again with a zoom', async ({ page }) => {
  await reach(page, 'birds_05');
  await page.locator('#optionsEl .option').first().click();
  await page.locator('#endExamBtn').click();
  await page.locator('#endConfirm .btn-primary').click();
  const picture = page.locator('.res-img').first();
  await expect(picture).toHaveAttribute('alt', 'Slide');
  await picture.click();
  await expect(page.locator('#zoomOverlay')).toHaveClass(/active/);
});
