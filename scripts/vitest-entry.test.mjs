import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { vitestEntry } from './vitest-entry.mjs';

describe('vitestEntry', () => {
  it('names a file that exists, so qa:ws can start Vitest', () => {
    const entry = vitestEntry();
    expect(entry).toMatch(/vitest\.mjs$/);
    expect(existsSync(entry)).toBe(true);
  });
});
