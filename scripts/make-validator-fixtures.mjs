// Regenerates packages/quiz-validator/test/fixtures/real-app/cases.json by running the REAL
// quiz app's validator (tools/validate_quiz.py) on the small made-up content folders below.
//
//   node scripts/make-validator-fixtures.mjs <path to the real app folder> [python]
//
// The real folder is only read, never copied. Pass a Python that has Pillow installed (the real
// tool reads picture widths with it); the default is `python`. Every string below is invented (the
// repo is public). After running, update the commit in
// packages/quiz-validator/test/fixtures/real-app/SOURCE.md and review the diff: a change means the
// real validator's behaviour changed.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { argv, env, exit, stdout } from 'node:process';
import { createCanvas, encodePng } from './png.mjs';

const realApp = argv[2];
const python = argv[3] ?? 'python';
if (realApp === undefined) {
  stdout.write('Usage: node scripts/make-validator-fixtures.mjs <real app folder> [python]\n');
  exit(1);
}
const outFile = join(
  import.meta.dirname,
  '..',
  'packages',
  'quiz-validator',
  'test',
  'fixtures',
  'real-app',
  'cases.json',
);

// ─── Building blocks ─────────────────────────────────────────────────────────

const course = (code, short, extra = {}) => ({
  code,
  name: `Course ${code}`,
  short,
  order: 1,
  ...extra,
});

/** A text question that passes every rule; `extra` overrides fields. */
const text = (id, extra = {}) => ({
  type: 'text',
  id,
  question: `What is item ${id}?`,
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  correct: 0,
  explanation: 'It is the first one.',
  ...extra,
});

const part = (id, extra = {}) => ({
  id,
  question: `What is item ${id}?`,
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  correct: 0,
  explanation: 'It is the first one.',
  ...extra,
});

const group = (id, parts, extra = {}) => ({
  type: 'image-group',
  id,
  image_path: 'images/c1/ok.png',
  parts,
  ...extra,
});

/** A quiz file body for course `code`. */
const quiz = (code, questions, extra = {}) => ({
  title: 'A quiz',
  course: code,
  unit: 'Week 1',
  questions,
  ...extra,
});

const IMAGES = { 'images/c1/ok.png': 500 };

// ─── The cases ───────────────────────────────────────────────────────────────

const cases = [
  {
    name: 'a clean course',
    registry: [course('c1', 'one')],
    files: { 'c1/one-w1-a.json': quiz('c1', [text('one_01'), text('one_02')]) },
    images: IMAGES,
  },
  {
    name: 'registry entries that are wrong',
    registry: [
      5,
      course('Bad Code', 'x'),
      course('c1', 'A!', {
        name: '',
        order: true,
        archived: 'yes',
        legacy_ids: 1,
        term: 3,
        answer_by: 'speak',
      }),
      course('c1', 'dup'),
      course('c2', 'dup'),
      course('c3', 'three', { order: 'first' }),
    ],
    files: { 'c1/dup-w1-a.json': quiz('c1', [text('dup_01')]) },
    emptyFolders: ['c4', '_hidden', '.cache'],
    images: IMAGES,
  },
  {
    name: 'registry top level is not a list',
    registry: { code: 'c1' },
    files: { 'c1/one-w1-a.json': quiz('c1', [text('one_01')]) },
    images: IMAGES,
  },
  {
    name: 'no registry file',
    registry: null,
    files: { 'c1/one-w1-a.json': quiz('c1', [text('one_01')]) },
    images: IMAGES,
  },
  {
    name: 'files that are not quizzes',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': [],
      'c1/one-w1-b.json': { questions: 5 },
      'c1/one-w1-c.json': { title: 'x', course: 'c1', unit: 'u', questions: [] },
    },
    images: IMAGES,
  },
  {
    name: 'top-level fields and the group label',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': { questions: [text('one_01')] },
      'c1/one-w1-b.json': quiz('c1', [text('one_02')], { group: '' }),
      'c1/one-w1-c.json': quiz('c1', [text('one_03')], { group: 'x'.repeat(31) }),
      'c1/one-w1-d.json': quiz('c1', [text('one_04')], { group: ' Starter ' }),
      'c1/one-w1-e.json': quiz('c1', [text('one_05')], { group: 7 }),
    },
    images: IMAGES,
  },
  {
    name: 'file name, course label and id prefix',
    registry: [course('c1', 'one'), course('c2', 'two', { legacy_ids: true }), course('c3', '')],
    files: {
      'c1/other-w1-a.json': quiz('c1', [text('one_01')]),
      'c1/one-w1-b.json': quiz('c9 Something', [text('one_02')]),
      'c1/one-w1-c.json': quiz('C1 Upper', [text('wrong_03'), text('one_04')]),
      'c2/two-w1-a.json': quiz('c2', [text('anything_05')]),
      'c3/whatever.json': quiz('c3', [text('free_06')]),
    },
    images: IMAGES,
  },
  {
    name: 'entries that are not questions',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        3,
        'text',
        {},
        { type: 'bogus', id: 'one_01' },
        { type: 'text' },
        text('one_02'),
        text('one_02', { question: 'A different question?' }),
        { id: 'one_03', question: 'No type?' },
        text(7),
        text(''),
      ]),
    },
    images: IMAGES,
  },
  {
    name: 'questions that break the schema',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        text('one_01', { question: '' }),
        text('one_02', { question: 5 }),
        text('one_03', { options: ['a', 'b', 'c'] }),
        text('one_04', { options: 'abcd' }),
        text('one_05', { options: ['a', '', 'c', 'd'] }),
        text('one_06', { options: ['a', 5, 'c', 'd'] }),
        text('one_07', { options: ['Cell', 'cell.', 'Tea', 'Milk'] }),
        text('one_08', { options: ['Caf\u00e9', 'caf\u00e9', 'Tea', 'Milk'] }),
        text('one_09', { options: ['Na\u00efve one', 'Na ve one', 'Tea', 'Milk'] }),
        text('one_10', { options: ['a/b', 'a b', 'Tea', 'Milk'] }),
        text('one_11', { correct: 4 }),
        text('one_12', { correct: -1 }),
        text('one_13', { correct: '1' }),
        text('one_14', { correct: true }),
        text('one_15', { correct: null }),
        text('one_16', { explanation: '  ' }),
        text('one_17', { explanation: 12 }),
      ]),
    },
    images: IMAGES,
  },
  {
    name: 'wording warnings',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        text('one_01', { question: 'What is this' }),
        text('one_02', { question: 'What is this? Or that?' }),
        text('one_03', { question: 'Which of the following is a bird?' }),
        text('one_04', { question: 'What is a bird? Explain.' }),
        text('one_05', { question: 'Name a bird? Describe' }),
        text('one_06', {
          options: ['All of the above', 'None of the above', 'Both of the above', 'Tea'],
        }),
        text('one_07', { explanation: 'One. Two. Three. Four.' }),
        text('one_08', {
          explanation: 'It is so. See (a). Then (b)? Yes! "Quoted" ends. 4 is next.',
        }),
        text('one_09', { question: 'What does arrow a point to?' }),
        text('one_10', { question: 'What do arrows a and b point to?' }),
        text('one_11', { question: 'What does bracket (a) mark?' }),
        text('one_12', { question: 'What does the arrow labelled C point to?' }),
        text('one_13', { question: 'What is the letter D near the top?' }),
        text('one_14', { question: 'Where is the box E?' }),
        text('one_15', { question: 'What marks a secondary follicle?' }),
        text('one_16', { question: 'What does the label a show?' }),
        text('one_17', { question: 'What is labelled a?' }),
        text('one_18', { explanation: 'M marks the medulla.' }),
        text('one_19', { explanation: 'The pointer GM marks it.' }),
        text('one_20', { explanation: 'It marks a layer, and arrow b is the edge.' }),
        text('one_21', { question: 'What does arrow a\u00e9 mean?' }),
        text('one_22', { question: 'What is it? \u00e9explain.' }),
        text('one_23', { question: 'What do the labels a, b or c show?' }),
        text('one_24', { question: 'Pointer 1 shows what?' }),
        text('one_25', { question: 'Is arrow a is the end?' }),
      ]),
    },
    images: IMAGES,
  },
  {
    name: 'a long correct answer',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        text('one_01', {
          options: ['An answer that is far too long to be plausible here', 'No', 'Yes', 'Maybe'],
        }),
        text('one_02', {
          options: ['A', 'An answer that is too long and sits among options', 'B', 'C'],
          correct: 1,
        }),
      ]),
    },
    images: IMAGES,
  },
  {
    name: 'pictures that cannot be used',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        { ...text('one_01'), type: 'image' },
        { ...text('one_02'), type: 'image', image_path: '' },
        { ...text('one_03'), type: 'image', image_path: 5 },
        { ...text('one_04'), type: 'image', image_path: 'images/../ok.png' },
        { ...text('one_06'), type: 'image', image_path: '/images/c1/ok.png' },
        { ...text('one_07'), type: 'image', image_path: 'C:\\images\\c1\\ok.png' },
        { ...text('one_08'), type: 'image', image_path: 'images/c1/ok.bmp' },
        { ...text('one_09'), type: 'image', image_path: 'images/c1/missing.png' },
        { ...text('one_10'), type: 'image', image_path: 'images' },
        { ...text('one_11'), type: 'image', image_path: 'images\\c1\\ok.png' },
        { ...text('one_12'), type: 'image', image_path: 'images/c1/../c1/ok.png' },
        { ...text('one_13'), type: 'image', image_path: 'images/c1/big.PNG' },
        { ...text('one_14'), image_path: 'images/c1/ok.png' },
        { ...text('one_15'), parts: [] },
        { ...text('one_16'), type: 'image', image_path: 'images/c1/ok.png' },
        { ...text('one_17'), type: 'image', image_path: 'images/c1/narrow.png' },
        { ...text('one_18'), type: 'image', image_path: 'images/c1/narrow.png' },
        { ...text('one_19'), type: 'image', image_path: 'images/c1/narrow.jpg' },
      ]),
      'c1/one-w1-b.json': quiz('c1', [
        { ...text('one_20'), type: 'image', image_path: 'images/c1/narrow.png' },
      ]),
    },
    images: {
      ...IMAGES,
      'images/c1/big.PNG': 500,
      'images/c1/narrow.png': 300,
      'images/c1/ok.bmp': 500,
    },
  },
  {
    name: 'repeated question text',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        text('one_01', { question: 'What is a feather?' }),
        text('one_02', { question: 'what  is a FEATHER' }),
        text('one_03', { question: 'What is a feather!?' }),
        text('one_04', { question: 'What is a feather?', options: ['x', 'y', 'z', 'w'] }),
      ]),
    },
    images: IMAGES,
  },
  {
    name: 'image-groups that are wrong',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        group('one_group_01', []),
        group('one_group_02', 'parts'),
        group('one_group_03', [part('one_group_03_p1')]),
        group(
          'one_group_04',
          ['1', '2', '3', '4', '5', '6'].map((n) => part(`one_group_04_p${n}`)),
        ),
        group('one_group_05', [part('one_group_05_p1'), part('one_group_05_p2')], {
          question: 'Stray?',
          options: [],
          correct: 0,
          explanation: 'Stray.',
        }),
        group('one_group_06', [
          7,
          part(''),
          part('one_group_06_p1'),
          part('one_group_06_p1'),
          part('one_group_06_p3'),
          part('one_group_06_p2'),
          part('wrong_p9'),
          part('one_group_06_pX'),
        ]),
        group('one_group_07', [{ question: 'No id?' }, part('one_group_07_p2')]),
        group('one_group_08', [part('one_group_08_p1'), part('one_group_08_p2')], {
          image_path: '',
        }),
        { type: 'image-group', id: 'one_group_09', image_path: 'images/c1/ok.png' },
        group('one_group_10', [
          part('one_group_10_p1', { options: ['a', 'b'] }),
          part('one_group_10_p2'),
        ]),
      ]),
    },
    images: IMAGES,
  },
  {
    name: 'explanations that give away a later part',
    registry: [course('c1', 'one')],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        group('one_group_01', [
          part('one_group_01_p1', {
            options: ['Red', 'Blue', 'Green', 'Black'],
            explanation: 'The stain is red, and it turns the nuclei purple.',
          }),
          part('one_group_01_p2', {
            options: ['Purple', 'Pink', 'Grey', 'Brown'],
            explanation: 'Nuclei are purple.',
          }),
          part('one_group_01_p3', {
            options: ['Green', 'Pink', 'Tan', 'Teal'],
            explanation: 'Nothing here.',
          }),
        ]),
        group('one_group_02', [
          part('one_group_02_p1', {
            options: ['Skin', 'Bone', 'Gut', 'Lung'],
            explanation: 'It is not bone, and it is not Gut either.',
          }),
          part('one_group_02_p2', { options: ['Bone', 'Fat', 'Hair', 'Nail'] }),
          part('one_group_02_p3', { options: ['Fat', 'Bone', 'Hair', 'Nail'] }),
        ]),
        group('one_group_03', [
          part('one_group_03_p1', {
            options: ['Cell wall', 'Cell', 'Wall', 'Gel'],
            explanation: 'A cell walls it in.',
          }),
          part('one_group_03_p2', { options: ['Cell', 'Wall', 'Gel', 'Pore'] }),
          part('one_group_03_p3', {
            options: ['Pore', 'Gel', 'Wall', 'Cell'],
            explanation: 'The pore in the cell wall.',
          }),
        ]),
        group('one_group_04', [
          part('one_group_04_p1', {
            options: ['Caf\u00e9 table', 'Tea', 'Milk', 'Cake'],
            explanation: 'It is not a caf\u00e9s.',
          }),
          part('one_group_04_p2', { options: ['Caf\u00e9', 'Tea', 'Milk', 'Cake'] }),
        ]),
        group('one_group_05', [
          part('one_group_05_p1', { explanation: 'x' }),
          part('one_group_05_p2', { options: ['Al', 'Bo', 'Cy', 'Di'] }),
        ]),
      ]),
    },
    images: IMAGES,
  },
  {
    name: 'ids and names across files and courses',
    registry: [course('c1', 'one'), course('c2', 'one2', { legacy_ids: true })],
    files: {
      'c1/one-w1-a.json': quiz('c1', [
        text('one_01'),
        group('one_group_01', [part('one_group_01_p1'), part('one_group_01_p2')]),
      ]),
      'c1/one-w1-b.json': quiz('c1', [text('one_01', { question: 'Another question?' })]),
      'c1/one-w1-c.json': quiz('c1', [
        group('one_group_02', [part('one_group_01_p2'), part('one_group_02_p2')]),
      ]),
      'c2/one-w1-a.json': quiz('c2', [text('one_01', { question: 'Third question?' })]),
      'c2/one2-w1-b.json': quiz('c2', [
        text('one_01', { question: 'Fourth question?' }),
        {
          type: 'text',
          question: 'Keyed by its text?',
          options: ['a', 'b', 'c', 'd'],
          correct: 0,
          explanation: 'Yes.',
        },
      ]),
      'c2/one2-w1-c.json': quiz('c2', [
        {
          type: 'text',
          question: 'Keyed by its text?',
          options: ['a', 'b', 'c', 'd'],
          correct: 0,
          explanation: 'Yes.',
        },
      ]),
      'c1/_draft.json': { not: 'a quiz' },
      '_hidden/one-w1-z.json': { not: 'a quiz' },
    },
    rootFiles: { 'stray.json': quiz('c1', [text('one_77')]), '_ignored.json': { x: 1 } },
    images: IMAGES,
  },
];

// ─── Running the real validator ──────────────────────────────────────────────

/** The width of the PNG written for a picture; only the width matters to the validator. */
const pictureBytes = (width) => encodePng(createCanvas(width, 2, [0, 0, 0]));

function writeTree(root, testCase) {
  const quizzes = join(root, 'quizzes');
  mkdirSync(quizzes, { recursive: true });
  const put = (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    const bytes = Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 2);
    writeFileSync(path, bytes);
  };
  if (testCase.registry !== null) put(join(quizzes, 'courses.json'), testCase.registry);
  for (const [path, body] of Object.entries(testCase.files)) put(join(quizzes, path), body);
  for (const [path, body] of Object.entries(testCase.rootFiles ?? {}))
    put(join(quizzes, path), body);
  for (const folder of testCase.emptyFolders ?? [])
    mkdirSync(join(quizzes, folder), { recursive: true });
  for (const [path, width] of Object.entries(testCase.images))
    put(join(root, path), pictureBytes(width));
}

const FINDING = /^(ERROR|WARN|NOTE)\s+(\S+) \[(.*?)\] (.*)$/;

function runRealValidator(root) {
  const run = spawnSync(python, ['-B', 'tools/validate_quiz.py', '--strict', '--quiz-dir', root], {
    cwd: realApp,
    encoding: 'utf8',
    env: { ...env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  if (run.stdout.includes('Pillow not installed')) {
    throw new Error('the real validator needs Pillow: pass a Python that has it');
  }
  if (run.stderr.includes('Traceback'))
    throw new Error(`the real validator crashed:\n${run.stderr}`);
  return run.stdout
    .split(/\r?\n/)
    .map((line) => FINDING.exec(line))
    .filter((match) => match !== null)
    .map(([, level, file, where, message]) => ({ level, file, where, message }));
}

const results = [];
for (const testCase of cases) {
  const root = mkdtempSync(join(tmpdir(), 'validator-case-'));
  try {
    writeTree(root, testCase);
    results.push({ ...testCase, expected: runRealValidator(root) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

writeFileSync(outFile, `${JSON.stringify({ cases: results }, null, 2)}\n`);
for (const { name, expected } of results)
  stdout.write(`${String(expected.length).padStart(3)} findings  ${name}\n`);
