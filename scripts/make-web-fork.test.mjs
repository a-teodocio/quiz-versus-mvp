// Tests for scripts/make-web-fork.mjs: the refusals that keep the fork honest. The real page is
// not in this repo, so these use made-up text.
import { describe, expect, it } from 'vitest';
import {
  BANNED_DASHES,
  EDITS,
  SPLIT,
  applyEdits,
  assemblePage,
  makeFork,
  splitPage,
} from './make-web-fork.mjs';

describe('makeFork', () => {
  it('refuses a page that is not the recorded one', () => {
    expect(() => makeFork('<html>some other page</html>')).toThrow(/not the recorded one/);
  });
});

describe('applyEdits', () => {
  it('replaces a string and a pattern exactly as often as listed', () => {
    const edits = [
      { from: 'one', to: 'uno', count: 2 },
      { from: /t[a-z]o/g, to: 'dos', count: 1 },
    ];
    expect(applyEdits('one two one', edits)).toBe('uno dos uno');
  });

  it('refuses when an edit matches more or fewer times than listed', () => {
    expect(() => applyEdits('a a', [{ from: 'a', to: 'b', count: 1 }])).toThrow(/matched 2/);
    expect(() => applyEdits('a', [{ from: /z/g, to: 'b', count: 1 }])).toThrow(/matched 0/);
  });

  it('refuses text that still holds a banned dash, written out or as an escape', () => {
    for (const dash of BANNED_DASHES) {
      expect(() => applyEdits(`a ${dash} b`, []), dash).toThrow(/rules ban/);
    }
  });
});

describe('the recorded edits', () => {
  it('replace with text that holds no banned dash', () => {
    for (const { to } of EDITS) {
      for (const dash of BANNED_DASHES) expect(to.includes(dash), to).toBe(false);
    }
  });

  it('find the four private pieces by pattern, so this repo never spells them', () => {
    const patterns = EDITS.filter(({ from }) => from instanceof RegExp);
    expect(patterns).toHaveLength(4);
    for (const { from } of patterns) expect(from.flags).toContain('g');
  });
});

/** A page shaped like the fork, with each cut's marker line, built from SPLIT so it cannot drift. */
function madeUpFork() {
  const markers = (entries) =>
    entries.map(([name, prefix]) => `${prefix}${name}\nbody of ${name}\n`);
  return [
    '<html>\n<head>\n<script>\nhead script\n</script>\n<style>\n',
    ...markers(SPLIT.css).map((text) => text.replace('\nbody', ' */\nbody')),
    '</style>\n</head>\n<body>\nthe body\n<script>\n',
    ...markers(SPLIT.js),
    '</script>\n</body>\n</html>\n',
  ].join('');
}

describe('splitPage and assemblePage', () => {
  it('cut the page into files that put back give the page again', () => {
    const fork = madeUpFork();
    const { index, files } = splitPage(fork);
    expect([...files.keys()]).toEqual([
      ...SPLIT.css.map(([name]) => `css/${name}`),
      ...SPLIT.js.map(([name]) => `js/${name}`),
    ]);
    expect(index).toContain('<link rel="stylesheet" href="css/tokens.css">\n');
    expect(index).toContain('<script src="js/boot.js"></script>\n');
    expect(index).toContain('<script>\nhead script\n</script>\n');
    expect(index).not.toContain('body of');
    for (const text of files.values()) expect(text.endsWith('\n')).toBe(true);
    expect(assemblePage(index, files)).toBe(fork);
  });

  it('put the files in the order of the cuts, every file starting at its marker', () => {
    const { files } = splitPage(madeUpFork());
    expect(files.get('js/state.js')).toBe(`${SPLIT.js[0][1]}state.js\nbody of state.js\n`);
  });

  it('refuse a cut that matches no line or more than one', () => {
    const fork = madeUpFork();
    expect(() => splitPage(fork.replace(SPLIT.js[1][1], 'changed'))).toThrow(/home\.js matched 0/);
    expect(() =>
      splitPage(`${fork.replace('</script>\n</body>', `${SPLIT.js[1][1]}\n</script>\n</body>`)}`),
    ).toThrow(/home\.js matched 2/);
  });

  it('refuse a page without a style block or a closing script block', () => {
    expect(() => splitPage('<html></html>')).toThrow(/no <style> block/);
    expect(() => splitPage('<html><style>\nx\n</style>\n</html>')).toThrow(/closing <script>/);
  });

  it('refuse cuts that are out of order or leave lines before the first file', () => {
    const fork = madeUpFork();
    const first = `${SPLIT.js[0][1]}state.js\n`;
    expect(() => splitPage(fork.replace(first, `stray line\n${first}`))).toThrow(/not in order/);
    const [second, third] = [SPLIT.js[1], SPLIT.js[2]].map(
      ([name, prefix]) => `${prefix}${name}\n`,
    );
    const swapped = fork.replace(second, '@@\n').replace(third, second).replace('@@\n', third);
    expect(() => splitPage(swapped)).toThrow(/not in order/);
  });

  it('refuse to assemble a page whose tag names a missing file', () => {
    const { index, files } = splitPage(madeUpFork());
    files.delete('js/boot.js');
    expect(() => assemblePage(index, files)).toThrow(/js\/boot\.js, which is missing/);
  });
});
