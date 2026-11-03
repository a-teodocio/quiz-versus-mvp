// Shared set-up and steps for the browser tests that pin the forked page.
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { partsOf, rightAnswer, tidy, wrongAnswer, type QuizFile } from './content.js';

/**
 * `test`, with two guards on every page: nothing leaves this machine (the page asks Google for a
 * font; the request is refused and the page falls back to a system font), and an error thrown in
 * the page fails the test.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await page.route(
      (url) => url.hostname !== '127.0.0.1',
      (route) => route.abort(),
    );
    await seedRandom(page, 20261102);
    await use(page);
    expect(problems).toEqual([]);
  },
});

export { expect };

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opens the home page and waits until the quiz list has been drawn. */
export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#quizList .quiz-item').first()).toBeAttached();
}

/** The row of the quiz list with this title. */
export const quizRow = (page: Page, title: string): Locator =>
  page.locator('#quizList .quiz-item', {
    has: page.locator('.quiz-item-title', { hasText: title }),
  });

/** Opens a unit tab (when the quiz sits on another one), clicks a quiz row and confirms the start window. */
export async function startQuiz(page: Page, title: string, tab?: string): Promise<void> {
  if (tab !== undefined) await page.locator('#unitTabs .t-opt', { hasText: tab }).click();
  await quizRow(page, title).click();
  await page.locator('#startConfirmBtn').click();
  await expect(page.locator('#quizView')).toBeVisible();
}

/** The question or picture-group part on screen, whitespace as shown. */
export async function questionOnScreen(page: Page): Promise<string> {
  return tidy((await page.locator('#questionText').textContent()) ?? '');
}

/**
 * Moves through a multiple-choice quiz (the first option, then Next) until this question text is
 * on screen, so a test does not depend on the order the page drew.
 */
export async function skipTo(page: Page, questionText: string): Promise<void> {
  for (let step = 0; step < 30; step += 1) {
    if ((await questionOnScreen(page)) === tidy(questionText)) return;
    await page.locator('#optionsEl .option').first().click();
    await page.locator('#nextBtn').click();
  }
  throw new Error(`Never reached "${questionText}"`);
}

/** The option with this text. */
export const optionWith = (page: Page, text: string): Locator =>
  page.locator('#optionsEl .option', {
    has: page.locator('.option-text', { hasText: new RegExp(`^${escapeRegExp(text)}$`) }),
  });

/** Picks the right or a wrong option for the question on screen and returns its text. */
export async function answerOnScreen(
  page: Page,
  file: QuizFile,
  which: 'right' | 'wrong',
): Promise<string> {
  const question = await questionOnScreen(page);
  const text = which === 'right' ? rightAnswer(file, question) : wrongAnswer(file, question);
  await optionWith(page, text).click();
  return text;
}

/** What `playThrough` did with one part. */
export interface Played {
  readonly question: string;
  readonly which: 'right' | 'wrong';
}

/** Answers every part in turn (`plan` says right or wrong for each) and presses Next after each. */
export async function playThrough(
  page: Page,
  file: QuizFile,
  plan: readonly ('right' | 'wrong')[] = partsOf(file).map(() => 'right'),
): Promise<Played[]> {
  const played: Played[] = [];
  for (const which of plan) {
    const question = await questionOnScreen(page);
    await answerOnScreen(page, file, which);
    played.push({ question, which });
    await page.locator('#nextBtn').click();
  }
  return played;
}

/** A value stored by the page, parsed as JSON (null when the key is absent). */
export async function stored(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  }, key);
}

/** A value stored by the page, as the text it was stored as (null when the key is absent). */
export async function storedText(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** Replaces `Math.random` with a seeded generator before the page runs, so shuffles repeat. */
export async function seedRandom(page: Page, seed: number): Promise<void> {
  await page.addInitScript((initial) => {
    let a = initial;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}
