// Guards the forked page (packages/web/public/) against drift: its files are the ones the page
// loads and nothing else, they hold nothing the public repo bans, and the storage keys the code
// lists are the ones the page uses.
//
// The page is index.html plus the stylesheets in css/ and the scripts in js/ (ADR 14). Until 5b a
// hash of the one-file page was checked here; the files are now edited by hand (ADR 15), so the
// behaviour is pinned by the Playwright tests and the text by the checks below.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRESS_EXPORT_PREFIX, RESUME_KEY_PREFIX, STORAGE_KEYS } from '../src/index.js';

const publicDir = join(import.meta.dirname, '..', 'public');
const index = readFileSync(join(publicDir, 'index.html'), 'utf8');

const STYLE_TAGS = /<link rel="stylesheet" href="(css\/[a-z-]+\.css)">\n/g;
const SCRIPT_TAGS = /<script src="(js\/[a-z-]+\.js)"><\/script>\n/g;

const read = (path: string): string => readFileSync(join(publicDir, path), 'utf8');
const referenced = (tags: RegExp): string[] =>
  [...index.matchAll(tags)].map(([, path]) => path ?? '');

/** The page as one text: each run of tags becomes one block holding the files in the order listed. */
function assemble(): string {
  const block = (tag: string, tags: RegExp) => (run: string) =>
    `<${tag}>\n${[...run.matchAll(tags)].map(([, path]) => read(path ?? '')).join('')}</${tag}>\n`;
  return index
    .replace(new RegExp(`(?:${STYLE_TAGS.source})+`), block('style', STYLE_TAGS))
    .replace(new RegExp(`(?:${SCRIPT_TAGS.source})+`), block('script', SCRIPT_TAGS));
}

const page = assemble();

describe('the forked page', () => {
  it('loads every stylesheet and script in the folders once, and nothing else', () => {
    for (const [folder, tags] of [
      ['css', STYLE_TAGS],
      ['js', SCRIPT_TAGS],
    ] as const) {
      const loaded = referenced(tags);
      expect(new Set(loaded).size, `${folder}/ is loaded twice`).toBe(loaded.length);
      const onDisk = readdirSync(join(publicDir, folder)).map((name) => `${folder}/${name}`);
      expect([...loaded].sort()).toEqual(onDisk.sort());
    }
  });

  it('keeps nothing else in public/, so nothing the lint and format ignores cover goes unnoticed', () => {
    expect(readdirSync(publicDir).sort()).toEqual(['css', 'index.html', 'js']);
  });

  it('loads its scripts as plain scripts: the inline handlers and the tests need their names global', () => {
    expect(index).not.toMatch(/<script[^>]*(?:type="module"|defer|async)/);
  });

  it('keeps LF line endings, as the real page has', () => {
    expect(index).not.toContain('\r');
    expect(page).not.toContain('\r');
  });

  it('holds no em or en dash, written out or as an escape', () => {
    const backslash = String.fromCodePoint(0x5c);
    const banned = [
      String.fromCodePoint(0x2014),
      String.fromCodePoint(0x2013),
      `${backslash}u2014`,
      `${backslash}u2013`,
      '&mdash;',
      '&ndash;',
      '&#8212;',
      '&#8211;',
    ];
    for (const dash of banned) expect(page.includes(dash), dash).toBe(false);
  });

  it('is still the real app: its title, its API calls and its storage prefix', () => {
    expect(page).toContain('<title>MLS Quiz</title>');
    for (const call of ['/api/list', '/api/courses', '/api/quiz?file=', '/image?path=']) {
      expect(page).toContain(call);
    }
  });

  it('uses exactly the storage keys the package lists', () => {
    const used = new Set(page.match(/mlsquiz_[a-z_]+:?/g));
    const listed = new Set<string>([...Object.values(STORAGE_KEYS), RESUME_KEY_PREFIX]);
    expect(used).toEqual(listed);
    expect(page).toContain(PROGRESS_EXPORT_PREFIX);
  });
});
