import { afterEach, expect, it } from 'vitest';
import { answerRight, nextQuestion, nextReveal } from './qa-game.js';
import { cleanup, isReadableSentence, lobby, Player, QUICK, start } from './qa-support.js';

afterEach(cleanup);

/** The next refusal the player is sent, as "code: text", so a failure shows the exact wording. */
async function told(player: Player): Promise<string> {
  const error = await player.next('error');
  return `${error.code}: ${error.message}`;
}

/** The refusals a person causes when joining. */
async function joiningRefusals(roomId: string): Promise<string[]> {
  const seen: string[] = [];
  const stranger = await Player.open(roomId);
  for (const name of ['', 'a'.repeat(25), 'a\u0007b', '👨‍👩‍👧', 'Zoe‍x']) {
    const answer = await stranger.tryJoin(name);
    const text = answer.type === 'error' ? `${answer.code}: ${answer.message}` : 'accepted';
    seen.push(`name ${JSON.stringify(name)} -> ${text}`);
  }
  const twin = await Player.open(roomId);
  const twinAnswer = await twin.tryJoin('Ada');
  seen.push(`duplicate name -> ${twinAnswer.type === 'welcome' ? 'accepted' : twinAnswer.message}`);
  const raw = await Player.open(roomId);
  raw.sendRaw('{}');
  seen.push(`malformed -> ${await told(raw)}`);
  raw.sendRaw('x'.repeat(3000));
  seen.push(`large -> ${await told(raw)}`);
  raw.send({ type: 'next' });
  seen.push(`not joined -> ${await told(raw)}`);
  const ghost = await Player.open('C'.repeat(22));
  seen.push(`unknown room -> ${await told(ghost)}`);
  return seen;
}

/** The refusals a person causes during a game. */
async function gameRefusals(players: readonly Player[]): Promise<string[]> {
  const [host, friend] = players;
  if (host === undefined || friend === undefined) throw new Error('no players');
  start(friend);
  const seen = [`start by guest -> ${await told(friend)}`];
  for (const overrides of [
    { questionCount: 0 },
    { questionCount: 99 },
    { secondsPerQuestion: 4 },
    { quizIds: ['no-such-quiz'] },
  ]) {
    start(host, overrides);
    seen.push(`settings ${JSON.stringify(overrides)} -> ${await told(host)}`);
  }
  start(host, { questionCount: 3 });
  const question = await nextQuestion(players);
  start(host);
  seen.push(`second start -> ${await told(host)}`);
  host.send({ type: 'next' });
  seen.push(`next in question -> ${await told(host)}`);
  answerRight(host, question);
  answerRight(host, question);
  seen.push(`answer twice -> ${await told(host)}`);
  answerRight(friend, question);
  await nextReveal(players);
  answerRight(friend, question);
  seen.push(`late answer -> ${await told(friend)}`);
  return seen;
}

it(
  'NEW-2: the wording of every refusal a person can cause is a sentence with no code in it (the list is in the failure message)',
  async () => {
    const { roomId, players } = await lobby(['Ada', 'Bo']);
    const seen = [...(await joiningRefusals(roomId)), ...(await gameRefusals(players))];
    const response = await fetch('http://127.0.0.1:8787/rooms', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    seen.push(`403 body -> ${await response.text()}`);
    // Only the lines that carry a "code: sentence" are judged; the 403 body is listed for reading.
    const bad = seen.filter((line) => {
      const text = line.slice(line.indexOf('-> ') + 3);
      return text.includes(': ') && !isReadableSentence(text.slice(text.indexOf(': ') + 2));
    });
    expect(bad, seen.join('\n')).toEqual([]);
  },
  QUICK,
);
