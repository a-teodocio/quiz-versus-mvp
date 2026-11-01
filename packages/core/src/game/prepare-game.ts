import { MAX_TIEBREAK_ROUNDS } from '@quiz-versus/protocol';
import type { GameSettings } from '@quiz-versus/protocol';
import type { Random } from '../ports/random.js';
import type { QuizRepository } from '../ports/quiz-repository.js';
import type { Item } from '../quiz/item.js';
import type { QuizEntry } from '../quiz/model.js';
import { shuffle } from '../shuffle/shuffle.js';
import { buildItems } from './build-items.js';
import { GameSetupError } from './game-plan.js';
import type { GamePlan } from './game-plan.js';
import { issueImageAlias } from './image-alias.js';

async function loadEntries(
  repository: QuizRepository,
  quizIds: readonly string[],
): Promise<QuizEntry[]> {
  const entries: QuizEntry[] = [];
  for (const quizId of quizIds) {
    const quiz = await repository.load(quizId);
    if (quiz === undefined) throw new GameSetupError('unknown-quiz', `no quiz named ${quizId}`);
    entries.push(...quiz.entries);
  }
  return entries;
}

/**
 * Chooses and shuffles a game's questions (async because loading is). Entries are shuffled and
 * taken in order; an image-group stays together, so the last one may be cut short when the count
 * does not fall on a group boundary (docs/fidelity.md). Parts beyond the count, and later
 * entries, become the tie-break reserve. Question count is in scored items, as in the protocol.
 */
export async function prepareGame(
  repository: QuizRepository,
  settings: GameSettings,
  random: Random,
): Promise<GamePlan> {
  const entries = shuffle(await loadEntries(repository, settings.quizIds), random);
  const wanted = settings.questionCount + MAX_TIEBREAK_ROUNDS;
  const items: Item[] = [];
  const images = new Map<string, string>();
  const style = { answerBy: settings.answerBy, random };
  for (const [at, entry] of entries.entries()) {
    if (items.length >= wanted) break;
    const alias =
      entry.type === 'text' ? undefined : issueImageAlias(random, new Set(images.keys()));
    if (alias !== undefined && entry.type !== 'text') images.set(alias, entry.image_path);
    items.push(...buildItems(entry, at + 1, alias, style));
  }
  if (items.length < settings.questionCount) {
    throw new GameSetupError('not-enough-questions', 'the chosen quizzes have too few questions');
  }
  return {
    regular: items.slice(0, settings.questionCount),
    spare: items.slice(settings.questionCount, wanted),
    images,
  };
}
