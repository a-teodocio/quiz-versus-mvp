import { afterEach, expect, it } from 'vitest';
import { answerRight, answerWrong, nextQuestion, nextReveal } from './qa-game.js';
import {
  cleanup,
  isReadableSentence,
  lobby,
  noteRefusal,
  Player,
  QUICK,
  SLOW,
  sleep,
  start,
} from './qa-support.js';

afterEach(cleanup);

/** Opens a new socket and takes the dropped seat back with its token. */
async function comeBack(old: Player): Promise<Player> {
  const again = await Player.open(old.roomId);
  await again.join(old.name, old.resumeToken);
  return again;
}

it(
  'R1: a refresh mid-question puts the player back in the same seat with the right time left; an answered player stays answered',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3, secondsPerQuestion: 20 });
    const question = await nextQuestion(players);
    answerRight(friend, question);
    await friend.next('answerAck');
    friend.drop();
    await host.nextRoom((r) => r.players.some((p) => !p.connected));
    await sleep(2_000);
    const again = await comeBack(friend);
    expect(again.playerId).toBe(friend.playerId);
    const resumed = await again.next('question');
    expect(resumed.itemKey).toBe(question.itemKey);
    expect(resumed.prompt).toBe(question.prompt);
    expect(resumed.durationMs).toBeLessThan(question.durationMs - 1_500);
    expect(resumed.durationMs).toBeGreaterThan(question.durationMs - 5_000);
    if (question.mode === 'pick' && resumed.mode === 'pick') {
      expect(resumed.options).toEqual(question.options);
    }
    const room = await again.nextRoom((r) => r.phase === 'question');
    expect(room.players.find((p) => p.id === friend.playerId)?.answered).toBe(true);
    // Not sent a second acknowledgement, and cannot answer again.
    await sleep(300);
    expect(again.pending('answerAck')).toEqual([]);
    answerWrong(again, question);
    const refused = await again.next('error');
    noteRefusal('R1 answer again after refresh', refused);
    expect(refused.code).toBe('ALREADY_ANSWERED');
  },
  QUICK,
);

it(
  'R2: offline during a question; the others are not held up; back in the reveal and after the results with the score intact',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    friend.drop();
    await host.nextRoom((r) => r.players.some((p) => !p.connected));
    const droppedAt = Date.now();
    answerRight(host, question);
    // The only connected player has answered, so the question closes at once.
    const reveal = await host.next('reveal', 10_000);
    expect(Date.now() - droppedAt).toBeLessThan(3_000);
    expect(reveal.reason).toBe('all-answered');
    const inReveal = await comeBack(friend);
    const caught = await inReveal.next('reveal');
    expect(caught.itemKey).toBe(question.itemKey);
    expect(caught.results.find((r) => r.playerId === friend.playerId)?.outcome).toBe('no-answer');
    // Play the rest while the friend stays connected, then go offline again after the results.
    host.send({ type: 'next' });
    for (let round = 2; round <= 3; round += 1) {
      const q = await nextQuestion([host, inReveal]);
      answerRight(host, q);
      answerRight(inReveal, q);
      await nextReveal([host, inReveal]);
      host.send({ type: 'next' });
    }
    const results = await host.next('results');
    inReveal.drop();
    await host.nextRoom((r) => r.players.some((p) => !p.connected));
    const afterResults = await comeBack(inReveal);
    const again = await afterResults.next('results');
    expect(again.standings).toEqual(results.standings);
    expect(again.standings.find((s) => s.name === 'Bo')?.score).toBe(2);
  },
  SLOW,
);

it(
  'R3: a player who joins while a question is open sees it with the time left, starts on 0, and the question waits for them',
  async () => {
    const { roomId, players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3, secondsPerQuestion: 20 });
    const question = await nextQuestion(players);
    await sleep(1_500);
    const late = await Player.open(roomId);
    await late.join('Cy');
    const seen = await late.next('question');
    expect(seen.itemKey).toBe(question.itemKey);
    expect(seen.durationMs).toBeLessThan(question.durationMs - 1_000);
    const room = await late.nextRoom((r) => r.players.length === 3);
    expect(room.players.find((p) => p.name === 'Cy')?.score).toBe(0);
    // Ada and Bo both answer: the question must still wait for Cy.
    answerRight(host, question);
    answerRight(friend, question);
    await sleep(1_000);
    expect(host.pending('reveal')).toEqual([]);
    answerRight(late, question);
    const reveal = await nextReveal([host, friend, late]);
    expect(reveal.reason).toBe('all-answered');
  },
  QUICK,
);

it(
  'R4: a player who joins during a reveal sees that reveal and waits for the next question',
  async () => {
    const { roomId, players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    answerRight(host, question);
    answerWrong(friend, question);
    const reveal = await nextReveal(players);
    const late = await Player.open(roomId);
    await late.join('Cy');
    const seen = await late.next('reveal');
    expect(seen.itemKey).toBe(reveal.itemKey);
    const room = await late.nextRoom((r) => r.players.length === 3);
    expect(room.phase).toBe('reveal');
    host.send({ type: 'next' });
    const second = await late.next('question');
    expect(second.progress).toMatchObject({ position: 2 });
  },
  QUICK,
);

it(
  'R5: after the results a new player is told the game is over; a returning player still sees the results',
  async () => {
    const { roomId, players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    for (let round = 1; round <= 3; round += 1) {
      const q = await nextQuestion(players);
      answerRight(host, q);
      answerWrong(friend, q);
      await nextReveal(players);
      host.send({ type: 'next' });
    }
    const results = await host.next('results');
    const newcomer = await Player.open(roomId);
    const refused = await newcomer.tryJoin('Cy');
    expect(refused.type).toBe('error');
    if (refused.type !== 'error') return;
    noteRefusal('R5 join after results', refused);
    expect(refused.code).toBe('GAME_OVER');
    expect(isReadableSentence(refused.message, refused.code)).toBe(true);
    friend.drop();
    await host.nextRoom((r) => r.players.some((p) => !p.connected));
    const back = await comeBack(friend);
    expect((await back.next('results')).standings).toEqual(results.standings);
  },
  SLOW,
);

it(
  'R6: the host drops during a reveal; another player becomes host and can continue; the old host, back, is a guest',
  async () => {
    const { players } = await lobby(['Ada', 'Bo', 'Cy']);
    const [host, bo, cy] = players;
    if (host === undefined || bo === undefined || cy === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    for (const p of players) answerRight(p, question);
    await nextReveal(players);
    host.drop();
    const room = await bo.nextRoom((r) => r.hostId !== host.playerId);
    expect(room.hostId).toBe(bo.playerId);
    bo.send({ type: 'next' });
    const second = await nextQuestion([bo, cy]);
    expect(second.progress).toMatchObject({ position: 2 });
    const old = await comeBack(host);
    const view = await old.nextRoom((r) => r.players.every((p) => p.connected));
    expect(view.hostId).toBe(bo.playerId);
    answerRight(old, second);
    answerRight(bo, second);
    answerRight(cy, second);
    await nextReveal([bo, cy, old]);
    old.send({ type: 'next' });
    const refused = await old.next('error');
    expect(refused.code).toBe('NOT_HOST');
  },
  SLOW,
);

it(
  'R7: when everyone has left, the old link says the room is not found',
  async () => {
    const { roomId, players } = await lobby(['Ada', 'Bo']);
    for (const p of players) p.leave();
    await Promise.all(players.map((p) => p.closed));
    const late = await Player.open(roomId);
    const error = await late.next('error');
    expect(error.code).toBe('ROOM_NOT_FOUND');
    expect(isReadableSentence(error.message, error.code)).toBe(true);
  },
  QUICK,
);

it(
  'R8: a second tab takes the seat; the older tab is closed with 4001; nobody gets two seats',
  async () => {
    const { roomId, players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    host.clear();
    const second = await Player.open(roomId);
    await second.join('Bo', friend.resumeToken);
    expect(second.playerId).toBe(friend.playerId);
    expect(await friend.closed).toBe(4001);
    const room = await host.nextRoom(
      (r) => r.players.length === 2 && r.players.every((p) => p.connected),
    );
    expect(room.players.map((p) => p.name)).toEqual(['Ada', 'Bo']);
    // The older tab, if its script still tries, cannot act as the player any more.
    expect(friend.isOpen).toBe(false);
    // The new tab is the seat: when the old socket's close arrives late, the seat stays connected.
    await sleep(500);
    const later = await host.nextRoom(() => true, 1_000).catch(() => undefined);
    if (later !== undefined) expect(later.players.every((p) => p.connected)).toBe(true);
  },
  QUICK,
);

it(
  'R9: resuming with a made-up or another room’s token is refused in a sentence and the socket can still join normally',
  async () => {
    const { roomId } = await lobby(['Ada']);
    const stranger = await Player.open(roomId);
    const refused = await stranger.tryJoin('Mallory', 'x'.repeat(22));
    expect(refused.type).toBe('error');
    if (refused.type !== 'error') return;
    noteRefusal('R9 bad resume token', refused);
    expect(refused.code).toBe('INVALID_RESUME_TOKEN');
    expect(isReadableSentence(refused.message, refused.code)).toBe(true);
    const fresh = await stranger.tryJoin('Mallory');
    expect(fresh.type).toBe('welcome');
  },
  QUICK,
);
