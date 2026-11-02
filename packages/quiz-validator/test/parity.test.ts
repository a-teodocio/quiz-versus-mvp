import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatFinding, MOCK_ONLY_PREFIX, validateTree } from '../src/index.js';
import { memoryTree } from './support/memory-tree.js';
import type { MemoryFolder } from './support/memory-tree.js';

/** What `scripts/make-validator-fixtures.mjs` writes: a content folder, and what the real tool said of it. */
interface ParityCase extends MemoryFolder {
  readonly name: string;
  readonly expected: readonly { level: string; file: string; where: string; message: string }[];
}

const fixturePath = join(import.meta.dirname, 'fixtures', 'real-app', 'cases.json');
// The generator writes this shape; the file is test data made by our own script.
const { cases } = JSON.parse(readFileSync(fixturePath, 'utf8')) as { cases: ParityCase[] };

describe('findings match the real validator (fixtures from tools/validate_quiz.py)', () => {
  it('has cases to compare', () => {
    expect(cases.length).toBeGreaterThan(10);
    expect(cases.some((testCase) => testCase.expected.length > 0)).toBe(true);
  });

  it.each(cases.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
    const { findings } = validateTree(memoryTree(testCase), { strict: true });
    const shared = findings.filter((finding) => !finding.message.includes(MOCK_ONLY_PREFIX));
    const expected = testCase.expected.map(
      (finding) =>
        `${finding.level.padEnd(5)} ${finding.file} [${finding.where}] ${finding.message}`,
    );
    expect(shared.map(formatFinding)).toEqual(expected);
  });
});
