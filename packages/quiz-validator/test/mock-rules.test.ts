import { MAX_OPTION_LENGTH, MAX_PROMPT_LENGTH } from '@quiz-versus/protocol';
import { describe, expect, it } from 'vitest';
import { formatFinding, MOCK_ONLY_PREFIX, validateTree } from '../src/index.js';
import { memoryTree } from './support/memory-tree.js';

const course = { code: 'c1', name: 'Course', short: 'one', order: 1 };
const question = {
  type: 'text',
  id: 'one_01',
  question: 'What is it?',
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  correct: 0,
  explanation: 'It is the first one.',
};
const quizWith = (...questions: unknown[]) => ({ title: 'T', course: 'c1', unit: 'U', questions });

/** The lines found in a one-course folder holding one file with the given text. */
function linesFor(body: unknown, name = 'one-w1-a.json', images: Record<string, number> = {}) {
  const tree = memoryTree({ registry: [course], files: { [`c1/${name}`]: body }, images });
  return validateTree(tree, { strict: true }).findings.map(formatFinding);
}

describe('rules only the mock has (they start with "mock:" or carry it in the message)', () => {
  it('finds nothing wrong with a question the game can carry', () => {
    expect(linesFor(quizWith(question))).toEqual([]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a question over the prompt limit', { question: `${'q'.repeat(MAX_PROMPT_LENGTH)}?` }],
    [
      'an option over the option limit',
      { options: ['Alpha', 'Beta', 'Gamma', 'd'.repeat(MAX_OPTION_LENGTH + 1)] },
    ],
  ])('refuses %s, though the real rules let it through', (_name, change) => {
    const lines = linesFor(quizWith({ ...question, ...change }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^ERROR one-w1-a\.json \[one_01\] mock: the game would refuse it: /);
  });

  it('does not add its own error to a question the real rules already reject', () => {
    const lines = linesFor(quizWith({ ...question, options: ['a', 'b', 'c'] }));
    expect(lines).toEqual(['ERROR one-w1-a.json [one_01] options must be a list of 4 (got 3)']);
  });

  it.each(['One-w1-a.json', 'one_w1_a.json', 'one-w1-a.v2.json', `one-${'x'.repeat(70)}.json`])(
    'refuses a file name that cannot be a quiz id: %s',
    (name) => {
      const lines = linesFor(quizWith(question), name);
      expect(
        lines.some((line) => line.includes(`${MOCK_ONLY_PREFIX}the file name must make a quiz id`)),
      ).toBe(true);
    },
  );

  it('refuses a picture outside images/, as the mock has no other root', () => {
    const picture = { ...question, type: 'image', image_path: 'slides/x.png' };
    expect(linesFor(quizWith(picture))).toEqual([
      `ERROR one-w1-a.json [one_01] image_path 'slides/x.png': ${MOCK_ONLY_PREFIX}pictures live under images/ only`,
    ]);
  });
});

describe('files the real validator reports differently, or reads in its own way', () => {
  it('reports text that is not JSON as a file that cannot be read', () => {
    expect(linesFor('{not json')).toEqual([
      expect.stringMatching(/^ERROR one-w1-a\.json \[-\] cannot read JSON: /),
    ]);
  });

  it('reports a registry that is not JSON', () => {
    const tree = memoryTree({ registry: '[{', files: { 'c1/one-w1-a.json': quizWith(question) } });
    const lines = validateTree(tree, { strict: true }).findings.map(formatFinding);
    expect(lines).toContainEqual(
      expect.stringMatching(/^ERROR courses\.json \[-\] cannot read the course registry: /),
    );
  });

  it('reads the width of a PNG only, so a JPEG gets no note however narrow', () => {
    const picture = { ...question, type: 'image', image_path: 'images/c1/p.jpg' };
    const folder = { registry: [course], files: { 'c1/one-w1-a.json': quizWith(picture) } };
    const jpegStart = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
    const tree = { ...memoryTree(folder), images: { fileHead: () => jpegStart } };
    expect(validateTree(tree, { strict: true }).findings).toEqual([]);
  });

  it('keeps notes out of the result unless asked for them', () => {
    const picture = { ...question, type: 'image', image_path: 'images/c1/p.png' };
    const tree = memoryTree({
      registry: [course],
      files: { 'c1/one-w1-a.json': quizWith(picture) },
      images: { 'images/c1/p.png': 100 },
    });
    expect(validateTree(tree, { strict: false }).findings).toEqual([]);
    expect(validateTree(tree, { strict: true }).findings).toHaveLength(1);
  });

  it('counts entries, scored parts and groups for each readable file', () => {
    const group = {
      type: 'image-group',
      id: 'one_group_01',
      image_path: 'images/c1/p.png',
      parts: [
        { ...question, id: 'one_group_01_p1', type: undefined },
        { ...question, id: 'one_group_01_p2', question: 'And this?', type: undefined },
      ],
    };
    const tree = memoryTree({
      registry: [course],
      files: { 'c1/one-w1-a.json': quizWith(question, group), 'c1/one-w1-b.json': '{oops' },
      images: { 'images/c1/p.png': 500 },
    });
    const { files } = validateTree(tree, { strict: true });
    expect(files).toEqual([
      { course: 'c1', name: 'one-w1-a.json', stats: { entries: 2, scored: 3, groups: 1 } },
    ]);
  });
});
