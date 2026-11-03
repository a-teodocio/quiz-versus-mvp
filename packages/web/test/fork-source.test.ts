// Guards the forked page (packages/web/public/index.html) against drift: the committed file is the
// one SOURCE.md records, it holds nothing the public repo bans, and the storage keys the code
// lists are the ones the page uses.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRESS_EXPORT_PREFIX, RESUME_KEY_PREFIX, STORAGE_KEYS } from '../src/index.js';

const packageDir = join(import.meta.dirname, '..');
const page = readFileSync(join(packageDir, 'public', 'index.html'), 'utf8');
const sourceNotes = readFileSync(join(packageDir, 'SOURCE.md'), 'utf8');

describe('the forked page', () => {
  it('is the file SOURCE.md records', () => {
    const recorded = /\*\*Fork SHA-256:\*\* `([0-9a-f]{64})`/.exec(sourceNotes)?.[1];
    expect(recorded).toBeDefined();
    expect(createHash('sha256').update(page).digest('hex')).toBe(recorded);
  });

  it('keeps LF line endings, as the real page has', () => {
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
