// Guards the forked page (packages/web/public/) against drift: the files are the ones SOURCE.md
// records, they hold nothing the public repo bans, and the storage keys the code lists are the
// ones the page uses.
//
// The page is cut into index.html plus the stylesheets in css/ and the scripts in js/. The cut is
// only a cut: putting each file back in place of its tag gives the one-file fork, and that text
// is what the hash covers. The assembly below is written here on purpose, apart from the script
// that made the cut, so that one does not vouch for the other.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRESS_EXPORT_PREFIX, RESUME_KEY_PREFIX, STORAGE_KEYS } from '../src/index.js';

const packageDir = join(import.meta.dirname, '..');
const publicDir = join(packageDir, 'public');
const sourceNotes = readFileSync(join(packageDir, 'SOURCE.md'), 'utf8');
const index = readFileSync(join(publicDir, 'index.html'), 'utf8');

const STYLE_TAGS = /<link rel="stylesheet" href="(css\/[a-z-]+\.css)">\n/g;
const SCRIPT_TAGS = /<script src="(js\/[a-z-]+\.js)"><\/script>\n/g;

const read = (path: string): string => readFileSync(join(publicDir, path), 'utf8');
const referenced = (tags: RegExp): string[] =>
  [...index.matchAll(tags)].map(([, path]) => path ?? '');

/** The one-file page: each run of tags becomes one block holding the files in the order listed. */
function assemble(): string {
  const block = (tag: string, tags: RegExp) => (run: string) =>
    `<${tag}>\n${[...run.matchAll(tags)].map(([, path]) => read(path ?? '')).join('')}</${tag}>\n`;
  return index
    .replace(new RegExp(`(?:${STYLE_TAGS.source})+`), block('style', STYLE_TAGS))
    .replace(new RegExp(`(?:${SCRIPT_TAGS.source})+`), block('script', SCRIPT_TAGS));
}

const page = assemble();

describe('the forked page', () => {
  it('is the file SOURCE.md records, once its files are put back in place', () => {
    const recorded = /\*\*Fork SHA-256:\*\* `([0-9a-f]{64})`/.exec(sourceNotes)?.[1];
    expect(recorded).toBeDefined();
    expect(createHash('sha256').update(page).digest('hex')).toBe(recorded);
  });

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
