// Tests for scripts/make-web-fork.mjs: the refusals that keep the fork honest. The real page is
// not in this repo, so these use made-up text.
import { describe, expect, it } from 'vitest';
import { BANNED_DASHES, EDITS, applyEdits, makeFork } from './make-web-fork.mjs';

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
