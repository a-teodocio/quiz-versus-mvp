// Regenerates packages/core/test/fixtures/real-app/*.json by running the REAL quiz app's shuffle
// and typed-answer functions on the made-up inputs below.
//
//   node scripts/make-core-fixtures.mjs <path to the real app's index.html>
//
// The real file is only read, never copied. Every input string here is invented (the repo is
// public). After running, update the commit in packages/core/test/fixtures/real-app/SOURCE.md and
// review the diff: a change means the real app's behaviour changed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stdout } from 'node:process';

const htmlPath = argv[2];
if (htmlPath === undefined) {
  stdout.write('Usage: node scripts/make-core-fixtures.mjs <path to index.html>\n');
  exit(1);
}
const outDir = join(import.meta.dirname, '..', 'packages', 'core', 'test', 'fixtures', 'real-app');
const html = readFileSync(htmlPath, 'utf8');

const slice = (from, to) => {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`markers not found: ${from} .. ${to}`);
  return html.slice(start, end);
};

const shuffleSource = slice('function shuffle(arr)', '// \u2500\u2500\u2500 Typed answers');
const typedSource = slice('const TYPED_CHARS', 'function foldChar');

const realFunctions = new Function(
  'Math',
  `${shuffleSource}\n${typedSource}\nreturn { shuffleQuestion, answerTooLong, answerForms, normTyped, sameTyped, editDistance, checkTyped };`,
);

/** The real code, with Math.random replaced by a fixed list of numbers. */
function withRandoms(randoms) {
  const queue = [...randoms];
  const fakeMath = Object.create(globalThis.Math);
  fakeMath.random = () => {
    if (queue.length === 0) throw new Error('ran out of fixed random numbers');
    return queue.shift();
  };
  return realFunctions(fakeMath);
}

// Shuffle: one random number per swap (i from n-1 down to 1).
const shuffleInputs = [
  {
    name: 'four distinct options',
    options: ['Kelvar', 'Dromm', 'Ozzle', 'Pinth'],
    correct: 2,
    randoms: [0.1, 0.9, 0.5],
  },
  {
    name: 'correct stays in place',
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correct: 0,
    randoms: [0.99, 0.99, 0.99],
  },
  {
    name: 'correct option moves to the end',
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correct: 0,
    randoms: [0, 0, 0],
  },
  {
    name: 'duplicate option text: first match wins',
    options: ['Same', 'Other', 'Same', 'Third'],
    correct: 2,
    randoms: [0.3, 0.6, 0.2],
  },
  { name: 'two options', options: ['Yes thing', 'No thing'], correct: 1, randoms: [0.4] },
  {
    name: 'correct index points at no option',
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correct: 7,
    randoms: [0.2, 0.7, 0.4],
  },
];
const shuffleCases = shuffleInputs.map((input) => {
  const question = withRandoms(input.randoms).shuffleQuestion({
    type: 'text',
    id: 'x',
    question: 'Q',
    options: input.options,
    correct: input.correct,
  });
  return { ...input, expectedOptions: question.options, expectedCorrect: question.shuffledCorrect };
});

// Typed answers: made-up correct answers and attempts.
const answers = [
  {
    correct: 'Zorbulin',
    typed: ['zorbulin', 'ZORBULIN', 'Zorbulins', 'the zorbulin', 'zorbulim', 'zorbxxxx', '', '   '],
  },
  {
    correct: 'Quillox (QX)',
    typed: ['quillox', 'qx', 'quillox qx', 'Quillox (QX)', 'quilox', 'quillix'],
  },
  {
    correct: 'Loose (fluffy) membrane',
    typed: ['loose membrane', 'loose fluffy membrane', 'fluffy membrane', 'loose membranes'],
  },
  { correct: "Mo'ra-vane", typed: ["Mo'ra-vane", 'Mora vane', 'MO\u2019RA VANE', 'mora-vane'] },
  { correct: 'Caf\u00e9 noir', typed: ['cafe noir', 'CAF\u00c9 NOIR', 'caf noir'] },
  { correct: 'Four word answer here', typed: ['four word answer here'] },
  { correct: '12 units', typed: ['12 units'] },
  { correct: 'A, B and C', typed: ['a b and c'] },
  { correct: 'Left/right', typed: ['left right'] },
  { correct: 'One (two) three (four)', typed: ['one three'] },
  { correct: '(Only bracket)', typed: ['only bracket'] },
  { correct: 'Trailing name (TN)', typed: ['tn', 'trailing name', 'trailing name tn'] },
];
const real = withRandoms([]);
const typedCases = answers.map(({ correct, typed }) => ({
  correct,
  tooLong: real.answerTooLong(correct),
  forms: real.answerForms(correct),
  checks: typed.map((text) => {
    const { ok, near } = real.checkTyped(text, correct);
    return { text, ok, near };
  }),
}));
const normCases = [
  'The Cell',
  'a  Test',
  'An apple',
  'Mo\u2019ra',
  'cafe\u0301',
  'well\u2010known',
  'em\u2014dash',
  'THE',
  'the the cat',
].map((text) => ({ text, normalised: real.normTyped(text) }));
const sameCases = [
  ['cell', 'cells'],
  ['box', 'boxes'],
  ['red cell', 'red cells'],
  ['reds cell', 'red cells'],
  ['cell', 'cell'],
  ['cell', 'sell'],
  ['a b', 'a'],
].map(([a, b]) => ({ a, b, same: real.sameTyped(a, b) }));
const distanceCases = [
  ['kitten', 'sitting'],
  ['', 'abc'],
  ['same', 'same'],
  ['ab', 'ba'],
].map(([a, b]) => ({ a, b, distance: real.editDistance(a, b) }));

/** JSON with every non-ASCII character written as an escape, so editors cannot mangle it. */
const asciiJson = (value) =>
  JSON.stringify(value, null, 2).replace(
    /[\u0080-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

writeFileSync(join(outDir, 'shuffle.json'), `${asciiJson(shuffleCases)}\n`);
writeFileSync(
  join(outDir, 'typed.json'),
  `${asciiJson({ typedCases, normCases, sameCases, distanceCases })}\n`,
);
stdout.write(`shuffle cases: ${shuffleCases.length}, typed cases: ${typedCases.length}\n`);
