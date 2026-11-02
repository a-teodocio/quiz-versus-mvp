import { afterEach, expect, it } from 'vitest';
import { answerRight, answerWrong, nextQuestion, nextReveal, table } from './qa-game.js';
import {
  cleanup,
  isReadableSentence,
  lobby,
  noteRefusal,
  Player,
  SLOW,
  sleep,
  start,
} from './qa-support.js';

afterEach(cleanup);

/** Plays three regular questions: `who` answers right on every one, the others wrong. */
async function playThree(
  players: readonly Player[],
  isRight: (who: number, round: number) => boolean,
): Promise<void> {
  const host = players[0];
  if (host === undefined) throw new Error('no host');
  for (let round = 0; round < 3; round += 1) {
    const q = await nextQuestion(players);
    players.forEach((p, who) => {
      if (isRight(who, round)) answerRight(p, q);
      else answerWrong(p, q);
    });
    await nextReveal(players);
    if (round < 2) host.send({ type: 'next' });
  }
}

it(
  'T1: two of three tie for first; the tie is announced at the last reveal, only they are asked, the third watches and is told',
  async () => {
    const { players } = await lobby(['Ada', 'Bo', 'Cy']);
    const [ada, bo, cy] = players;
    if (ada === undefined || bo === undefined || cy === undefined) throw new Error('no players');
    start(ada, { questionCount: 3 });
    await playThree(players, (who) => who < 2);
    const room = await ada.nextRoom((r) => r.phase === 'reveal' && r.tiebreak !== null);
    expect(room.tiebreak?.playerIds.sort()).toEqual([ada.playerId, bo.playerId].sort());
    ada.send({ type: 'next' });
    const q = await nextQuestion(players);
    expect(q.progress).toMatchObject({ kind: 'tiebreak' });
    // The watcher cannot answer, and is told so in words.
    answerRight(cy, q);
    const refused = await cy.next('error');
    noteRefusal('T1 watcher answers', refused);
    expect(refused.code).toBe('NOT_IN_TIEBREAK');
    expect(isReadableSentence(refused.message, refused.code)).toBe(true);
    // "Told why" (T1): that the others are tied, not only that this player is watching.
    expect(refused.message, 'says why the player is only watching').toMatch(
      /because|tied|level|equal|only the/i,
    );
    answerRight(ada, q);
    answerWrong(bo, q);
    const reveal = await nextReveal(players);
    expect(reveal.results.map((r) => r.playerId).sort()).toEqual(
      [ada.playerId, bo.playerId].sort(),
    );
    ada.send({ type: 'next' });
    const results = await ada.next('results');
    expect(results.standings.map((s) => [s.name, s.rank, s.score])).toEqual([
      ['Ada', 1, 4],
      ['Bo', 2, 3],
      ['Cy', 3, 0],
    ]);
  },
  SLOW,
);

it(
  'T2: players who stay level through five extra questions end as co-winners sharing rank 1',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [ada, bo] = players;
    if (ada === undefined || bo === undefined) throw new Error('no players');
    start(ada, { questionCount: 3 });
    await playThree(players, () => true);
    let extra = 0;
    for (;;) {
      ada.send({ type: 'next' });
      const arrived = await ada.nextAny(['question', 'results'], 30_000);
      if (arrived.type === 'results') {
        expect(extra).toBeLessThanOrEqual(5);
        expect(extra).toBeGreaterThan(0);
        expect(arrived.standings.map((s) => s.rank)).toEqual([1, 1]);
        expect(new Set(arrived.standings.map((s) => s.score)).size).toBe(1);
        return;
      }
      if (arrived.type !== 'question') throw new Error('expected a question or the results');
      extra += 1;
      expect(arrived.progress).toMatchObject({ kind: 'tiebreak' });
      await bo.next('question');
      answerRight(ada, arrived);
      answerRight(bo, arrived);
      await nextReveal(players);
    }
  },
  SLOW,
);

it(
  'T3: a tied player who leaves during the tie-break sends the game to the results at once, the other winning',
  async () => {
    const { players } = await lobby(['Ada', 'Bo', 'Cy']);
    const [ada, bo, cy] = players;
    if (ada === undefined || bo === undefined || cy === undefined) throw new Error('no players');
    start(ada, { questionCount: 3 });
    await playThree(players, (who) => who < 2);
    ada.send({ type: 'next' });
    await nextQuestion(players);
    bo.leave();
    const results = await ada.next('results', 5_000);
    expect(results.standings[0]).toMatchObject({ name: 'Ada', rank: 1 });
    expect((await cy.next('results', 5_000)).standings[0]?.name).toBe('Ada');
  },
  SLOW,
);

it(
  'T4: a tie below first place is not played off; equal scores share a rank (1, 2, 2, 4)',
  async () => {
    const { players } = await lobby(['Ada', 'Bo', 'Cy', 'Dee']);
    const [ada] = players;
    if (ada === undefined) throw new Error('no host');
    start(ada, { questionCount: 3 });
    // Ada 3, Bo 2, Cy 2, Dee 0.
    await playThree(players, (who, round) => who === 0 || (who < 3 && round < 2));
    ada.send({ type: 'next' });
    const results = await ada.next('results');
    expect(table(results.standings)).toEqual([
      ['Ada', 1, 3],
      ['Bo', 2, 2],
      ['Cy', 2, 2],
      ['Dee', 4, 0],
    ]);
  },
  SLOW,
);

it(
  'T5: a player who joined late and is level for first is not in the tie-break and ends level only if the others do',
  async () => {
    const { roomId, players } = await lobby(['Ada', 'Bo']);
    const [ada, bo] = players;
    if (ada === undefined || bo === undefined) throw new Error('no players');
    start(ada, { questionCount: 3 });
    // Question 1: Ada and Bo right (1 each). Cy joins during the reveal.
    const q1 = await nextQuestion(players);
    answerRight(ada, q1);
    answerRight(bo, q1);
    await nextReveal(players);
    const cy = await Player.open(roomId);
    await cy.join('Cy');
    ada.send({ type: 'next' });
    const everyone = [ada, bo, cy];
    // Question 2: only Cy right. Question 3: nobody answers right. All level on 1.
    const q2 = await nextQuestion(everyone);
    answerWrong(ada, q2);
    answerWrong(bo, q2);
    answerRight(cy, q2);
    await nextReveal(everyone);
    ada.send({ type: 'next' });
    const q3 = await nextQuestion(everyone);
    for (const p of everyone) answerWrong(p, q3);
    await nextReveal(everyone);
    const room = await ada.nextRoom((r) => r.phase === 'reveal' && r.tiebreak !== null);
    expect(room.tiebreak?.playerIds.sort()).toEqual([ada.playerId, bo.playerId].sort());
    ada.send({ type: 'next' });
    const tb = await nextQuestion(everyone);
    answerRight(cy, tb);
    expect((await cy.next('error')).code).toBe('NOT_IN_TIEBREAK');
    answerRight(ada, tb);
    answerWrong(bo, tb);
    await nextReveal(everyone);
    ada.send({ type: 'next' });
    const results = await ada.next('results');
    // Ada 2; Bo and Cy 1 each share second place.
    expect(table(results.standings)).toEqual([
      ['Ada', 1, 2],
      ['Bo', 2, 1],
      ['Cy', 2, 1],
    ]);
  },
  SLOW,
);

it('T5.2: when the tied players stay level through the tie-break, the late joiner who is level with them shares rank 1', async () => {
  const { roomId, players } = await lobby(['Ada', 'Bo']);
  const [ada, bo] = players;
  if (ada === undefined || bo === undefined) throw new Error('no players');
  start(ada, { questionCount: 3 });
  const q1 = await nextQuestion(players);
  answerRight(ada, q1);
  answerRight(bo, q1);
  await nextReveal(players);
  const cy = await Player.open(roomId);
  await cy.join('Cy');
  ada.send({ type: 'next' });
  const everyone = [ada, bo, cy];
  const q2 = await nextQuestion(everyone);
  answerWrong(ada, q2);
  answerWrong(bo, q2);
  answerRight(cy, q2);
  await nextReveal(everyone);
  ada.send({ type: 'next' });
  const q3 = await nextQuestion(everyone);
  for (const p of everyone) answerWrong(p, q3);
  await nextReveal(everyone);
  // Tie-break rounds where nobody scores: all three stay level, so all three are co-winners.
  for (;;) {
    ada.send({ type: 'next' });
    const arrived = await ada.nextAny(['question', 'results'], 30_000);
    if (arrived.type === 'results') {
      expect(table(arrived.standings)).toEqual([
        ['Ada', 1, 1],
        ['Bo', 1, 1],
        ['Cy', 1, 1],
      ]);
      return;
    }
    await nextReveal(everyone);
    await sleep(0);
  }
}, 120_000);
