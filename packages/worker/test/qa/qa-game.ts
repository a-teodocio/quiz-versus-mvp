import type { Player } from './qa-support.js';
import type { Msg } from './qa-support.js';

/**
 * The right answer to each question of the two fake quizzes, by prompt. The content is fake and
 * public, so the key lives here: it lets a test choose a right or a wrong answer on purpose even
 * though the options are shuffled in every game. (Taken from content/quizzes/*.json.)
 */
export const KEY: Readonly<Record<string, string>> = {
  'How many tail feathers does a Quillfinch grow?': 'Four',
  'What colour is the crest of a male Ember wren?': 'Scarlet',
  'When does a Marsh trumpeter moult its wing feathers?': 'In the dry season',
  'What is the soft layer under the outer feathers called?': 'Down',
  'What colour is the third band from the top of the picture?': 'Yellow',
  'What colour is the circle marked (B)?': 'Blue',
  'How many silhouettes does the picture show?': 'Six',
  'What colour is the silhouette that differs from the others?': 'Orange',
  'What does the field guide call a lone orange bird in a teal flock?': 'A beacon',
  'What is the dark mineral that scratches glass in the practice set?': 'Glimmerite',
  'Which practice mineral splits into thin sheets?': 'Fennel stone',
  "What is the lab book's short name for the clear mineral with a ring pattern?":
    'Orrery quartz (OQ)',
  'What do collectors call flint found on the hill behind the lab?': "Hob's flint",
  'Which gem is named after the first lab assistant?': 'Pip’s agate',
  'What is the cream-coloured spar with a flower pattern called?': 'Crème-fleur spar',
  'What is the grade of tuff that lets water pass through?': 'Loose (porous) tuff',
  'What hardness grade does Glimmerite get on the practice scale?': 'Grade 4',
  'Which two colours mark the safe edge of the sample tray?': 'Red, blue',
  'Which two layers meet at the seam in the practice cliff?': 'Lime / shale',
  'What does the lab book call the largest sample on the shelf?': 'Seven-layered grey crystal slab',
  'Which pair of codes is written on the twin sample bag?': 'Alpha (A) or Beta (B)',
  'Which circle on the tray is yellow?': 'Circle C',
  'What colour is the lowest layer in the picture?': 'Black',
  'How many squares does the grid hold?': 'Nine',
  'What colour is the square in the centre of the grid?': 'Purple',
  'What does a lone purple crystal in a blue grid usually show in the lab book?': 'A seed crystal',
};

export type Question = Msg<'question'>;
export type Reveal = Msg<'reveal'>;

/** The final table as [name, rank, score], equal ranks ordered by name (the order among equals is not specified). */
export function table(standings: Msg<'results'>['standings']): [string, number, number][] {
  return standings
    .map((s): [string, number, number] => [s.name, s.rank, s.score])
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
}

export function rightText(question: Question): string {
  const text = KEY[question.prompt];
  if (text === undefined) throw new Error(`no answer key for the prompt ${question.prompt}`);
  return text;
}

/** The index of the right option as the player saw it, for a `pick` question. */
export function rightIndex(question: Question): number {
  const index = (question.mode === 'pick' ? question.options : []).indexOf(rightText(question));
  if (index < 0) throw new Error(`the right answer is not among the options of ${question.prompt}`);
  return index;
}

/** An index that is certainly wrong. */
export const wrongIndex = (question: Question): number => (rightIndex(question) + 1) % 4;

export function pick(player: Player, question: Question, index: number): void {
  player.send({ type: 'answer', itemKey: question.itemKey, answer: { kind: 'pick', index } });
}

export const answerRight = (player: Player, question: Question): void => {
  pick(player, question, rightIndex(question));
};

export const answerWrong = (player: Player, question: Question): void => {
  pick(player, question, wrongIndex(question));
};

/** Every player gets the next question; returns the one the first player saw. */
export async function nextQuestion(players: readonly Player[]): Promise<Question> {
  const all = await Promise.all(players.map((player) => player.next('question')));
  const first = all[0];
  if (first === undefined) throw new Error('no players');
  return first;
}

/** What everyone should have been told when a question closed. */
export async function nextReveal(players: readonly Player[]): Promise<Reveal> {
  const all = await Promise.all(players.map((player) => player.next('reveal', 20_000)));
  const first = all[0];
  if (first === undefined) throw new Error('no players');
  return first;
}

/**
 * Plays a game where each question is answered by `decide` (a function from the question and the
 * player's index to "right", "wrong" or "none"). Returns the reveals and the results. Only for
 * games without a tie at the top; a tie-break question is left to time out.
 */
export async function playRegular(
  players: readonly Player[],
  decide: (question: Question, round: number, who: number) => 'right' | 'wrong' | 'none',
): Promise<{ questions: Question[]; reveals: Reveal[]; results: Msg<'results'> }> {
  const host = players[0];
  if (host === undefined) throw new Error('no players');
  const questions: Question[] = [];
  const reveals: Reveal[] = [];
  for (;;) {
    const arrived = await host.nextAny(['question', 'results'], 30_000);
    if (arrived.type === 'results') {
      return { questions, reveals, results: arrived };
    }
    if (arrived.type !== 'question') throw new Error('expected a question or the results');
    const question = arrived;
    questions.push(question);
    players.forEach((player, who) => {
      const choice = decide(question, questions.length - 1, who);
      if (choice === 'right') answerRight(player, question);
      if (choice === 'wrong') answerWrong(player, question);
    });
    reveals.push(await host.next('reveal', 30_000));
    host.send({ type: 'next' });
  }
}
