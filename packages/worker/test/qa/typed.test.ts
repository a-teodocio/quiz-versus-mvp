import { afterEach, expect, it } from 'vitest';
import { answerRight } from './qa-game.js';
import type { Question, Reveal } from './qa-game.js';
import {
  cleanup,
  isReadableSentence,
  lobby,
  noteRefusal,
  SLOW,
  sleep,
  start,
} from './qa-support.js';
import type { Player } from './qa-support.js';

afterEach(cleanup);

/** What Ada types (always right in some spelling), what Bo types, and how Bo's answer is judged. */
type Plan = readonly [ada: string, bo: string, boResult: 'right' | 'near' | 'far'];

/** What two players type for each rocks question that can be typed, and what should come of it. */
const TYPED: Readonly<Record<string, Plan>> = {
  'What is the dark mineral that scratches glass in the practice set?': [
    'glimmerite',
    'Glimmerit',
    'near',
  ],
  'Which practice mineral splits into thin sheets?': ['Fennel stones', 'Fennel ston', 'near'],
  "What is the lab book's short name for the clear mineral with a ring pattern?": [
    'OQ',
    'orrery quartz',
    'right',
  ],
  'What do collectors call flint found on the hill behind the lab?': [
    'hobs flint',
    'Hob’s flint',
    'right',
  ],
  'Which gem is named after the first lab assistant?': ["Pip's agate", "Tam's jasper", 'far'],
  'What is the cream-coloured spar with a flower pattern called?': [
    'creme fleur spar',
    'Plain spar',
    'far',
  ],
  'What is the grade of tuff that lets water pass through?': [
    'loose tuff',
    'Loose porus tuff',
    'near',
  ],
  'Which circle on the tray is yellow?': ['circle c', 'Circle B', 'near'],
  'What colour is the lowest layer in the picture?': ['BLACK', 'Red', 'far'],
  'How many squares does the grid hold?': ['nine', 'ten', 'far'],
  'What colour is the square in the centre of the grid?': ['purple', 'Purle', 'near'],
  'What does a lone purple crystal in a blue grid usually show in the lab book?': [
    'seed crystal',
    'a seed crystal',
    'right',
  ],
};

/** Questions whose right answer cannot be checked automatically: they must stay multiple choice. */
const STAY_PICK = [
  'What hardness grade does Glimmerite get on the practice scale?',
  'Which two colours mark the safe edge of the sample tray?',
  'Which two layers meet at the seam in the practice cliff?',
  'What does the lab book call the largest sample on the shelf?',
  'Which pair of codes is written on the twin sample bag?',
];

const typed = (player: Player, question: Question, text: string): void => {
  player.send({ type: 'answer', itemKey: question.itemKey, answer: { kind: 'type', text } });
};

/** How the reveal judged one player: 'right', 'near' (wrong but close) or 'far'. */
function verdict(reveal: Reveal, player: Player): string {
  const result = reveal.results.find((r) => r.playerId === player.playerId);
  if (result?.outcome === 'correct') return 'right';
  return result?.near === true ? 'near' : 'far';
}

/** One question of the P5 game: answers it as planned and reports what was wrong. */
async function playOne(question: Question, ada: Player, bo: Player): Promise<string[]> {
  const planned = TYPED[question.prompt];
  if (planned === undefined) {
    const problems = STAY_PICK.includes(question.prompt) ? [] : [`unplanned: ${question.prompt}`];
    if (question.mode !== 'pick')
      problems.push(`typed where it should be pick: ${question.prompt}`);
    answerRight(ada, question);
    answerRight(bo, question);
    await ada.next('reveal', 30_000);
    return problems;
  }
  typed(ada, question, planned[0]);
  typed(bo, question, planned[1]);
  const reveal = await ada.next('reveal', 30_000);
  const problems: string[] = [];
  if (question.mode !== 'type') problems.push(`not typed: ${question.prompt}`);
  if (verdict(reveal, ada) !== 'right') problems.push(`Ada typing ${planned[0]} was not right`);
  if (verdict(reveal, bo) !== planned[2]) {
    problems.push(`Bo typing ${planned[1]} was ${verdict(reveal, bo)}, not ${planned[2]}`);
  }
  return problems;
}

it(
  'P5: right answers score whatever the case, accent, apostrophe, plural, bracket or article; one letter off is wrong and close; long answers stay multiple choice',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [ada, bo] = players;
    if (ada === undefined || bo === undefined) throw new Error('no players');
    start(ada, { quizIds: ['rocks-w1-identification'], questionCount: 17, answerBy: 'type' });
    const problems: string[] = [];
    let seen = 0;
    for (;;) {
      const arrived = await ada.nextAny(['question', 'results'], 30_000).catch((error: unknown) => {
        // Say where the game stopped: the last prompts and every refusal Ada was sent.
        const refusals = ada.history.flatMap((m) => (m.type === 'error' ? [m.code] : []));
        const reason = error instanceof Error ? error.message : 'failed';
        throw new Error(
          `${reason}; after ${String(seen)} questions; refusals: ${refusals.join(',')}`,
        );
      });
      if (arrived.type !== 'question') break;
      await bo.next('question');
      seen += 1;
      problems.push(...(await playOne(arrived, ada, bo)));
      // A person sends a few messages a question. 17 instant questions would send over 30 messages
      // in 10 s and be rate limited (30 per 10 s per connection), which is not what is under test.
      await sleep(1_000);
      ada.send({ type: 'next' });
    }
    expect(seen).toBe(Object.keys(TYPED).length + STAY_PICK.length);
    expect(problems).toEqual([]);
  },
  SLOW,
);

it(
  'P5.2: the wrong kind of answer for the question is refused in a sentence and the question stays open (X4)',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [ada, bo] = players;
    if (ada === undefined || bo === undefined) throw new Error('no players');
    start(ada, { quizIds: ['rocks-w1-identification'], questionCount: 17, answerBy: 'type' });
    const refusals = new Set<string>();
    while (refusals.size < 2) {
      const question = await ada.next('question', 30_000);
      await bo.next('question');
      if (!refusals.has(question.mode)) {
        if (question.mode === 'type') {
          ada.send({
            type: 'answer',
            itemKey: question.itemKey,
            answer: { kind: 'pick', index: 0 },
          });
        } else {
          typed(ada, question, 'whatever');
        }
        const refused = await ada.next('error');
        noteRefusal(`X4 wrong kind of answer for a ${question.mode} question`, refused);
        expect(refused.code).toBe('INVALID_ANSWER');
        expect(isReadableSentence(refused.message, refused.code)).toBe(true);
        refusals.add(question.mode);
      }
      // The question is still open, so the player can answer properly: the game goes on.
      if (question.mode === 'type') {
        typed(ada, question, 'my answer');
        typed(bo, question, 'x');
      } else {
        answerRight(ada, question);
        answerRight(bo, question);
      }
      await ada.next('reveal', 30_000);
      ada.send({ type: 'next' });
    }
  },
  SLOW,
);

it(
  'P5.3: a typed answer of 200 characters is accepted, one of 201 is refused in a sentence',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [ada, bo] = players;
    if (ada === undefined || bo === undefined) throw new Error('no players');
    start(ada, { quizIds: ['rocks-w1-identification'], questionCount: 17, answerBy: 'type' });
    for (;;) {
      const question = await ada.next('question', 30_000);
      await bo.next('question');
      if (question.mode === 'type') {
        typed(ada, question, 'x'.repeat(201));
        const refused = await ada.next('error');
        noteRefusal('typed answer of 201 characters', refused);
        expect(isReadableSentence(refused.message, refused.code)).toBe(true);
        typed(ada, question, 'x'.repeat(200));
        await ada.next('answerAck');
        return;
      }
      answerRight(ada, question);
      answerRight(bo, question);
      await ada.next('reveal', 30_000);
      ada.send({ type: 'next' });
    }
  },
  SLOW,
);
