import { afterEach, expect, it } from 'vitest';
import {
  answerRight,
  answerWrong,
  KEY,
  nextQuestion,
  nextReveal,
  pick,
  playRegular,
  rightIndex,
  rightText,
} from './qa-game.js';
import {
  cleanup,
  HTTP,
  isReadableSentence,
  lobby,
  noteRefusal,
  QUICK,
  SLOW,
  sleep,
  start,
} from './qa-support.js';

afterEach(cleanup);

it(
  'P1: three players play a whole game; same questions, same options, scores add up, table is right',
  async () => {
    const { players } = await lobby(['Ada', 'Bo', 'Cy']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    start(host, { questionCount: 3 });
    // Ada always right, Bo right then wrong then right, Cy always wrong.
    const played = await playRegular(players, (_q, round, who) =>
      who === 0 ? 'right' : who === 1 ? (round === 1 ? 'wrong' : 'right') : 'wrong',
    );
    expect(played.questions).toHaveLength(3);
    // Everyone saw the same questions, in the same order, with the same option order.
    for (const player of players) {
      const seen = player.history.filter((m) => m.type === 'question');
      expect(seen).toEqual(host.history.filter((m) => m.type === 'question'));
    }
    played.questions.forEach((question, at) => {
      expect(question.progress).toEqual({ kind: 'regular', position: at + 1, totalItems: 3 });
      const reveal = played.reveals[at];
      expect(reveal?.itemKey).toBe(question.itemKey);
      expect(reveal?.reason).toBe('all-answered');
      expect(reveal?.correct).toMatchObject({ kind: 'pick', text: rightText(question) });
      expect(reveal?.correct.kind === 'pick' ? reveal.correct.index : -1).toBe(
        rightIndex(question),
      );
    });
    // Everyone got the identical reveal.
    for (const player of players) {
      expect(player.history.filter((m) => m.type === 'reveal')).toEqual(
        host.history.filter((m) => m.type === 'reveal'),
      );
    }
    const last = played.reveals[2];
    const scoreOf = (name: string): number | undefined =>
      last?.results.find((r) => r.playerId === players.find((p) => p.name === name)?.playerId)
        ?.score;
    expect(scoreOf('Ada')).toBe(3);
    expect(scoreOf('Bo')).toBe(2);
    expect(scoreOf('Cy')).toBe(0);
    expect(played.results.standings.map((s) => [s.name, s.rank, s.score, s.correctCount])).toEqual([
      ['Ada', 1, 3, 3],
      ['Bo', 2, 2, 2],
      ['Cy', 3, 0, 0],
    ]);
    // The host's copy was read by the game loop; the others must have the identical table.
    for (const player of players.slice(1)) {
      expect((await player.next('results')).standings).toEqual(played.results.standings);
    }
  },
  SLOW,
);

it(
  'P2: nobody answers; the question closes at zero, the reveal says nobody answered, clocks agree',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    start(host, { questionCount: 3 });
    const questions = await Promise.all(players.map((p) => p.next('question')));
    const openedAt = Date.now();
    expect(questions[0]?.durationMs).toBeGreaterThan(4_000);
    expect(questions[0]?.durationMs).toBeLessThanOrEqual(5_000);
    const arrivals: number[] = [];
    const reveals = await Promise.all(
      players.map(async (p) => {
        const reveal = await p.next('reveal', 20_000);
        arrivals.push(Date.now());
        return reveal;
      }),
    );
    const waited = Date.now() - openedAt;
    expect(waited).toBeGreaterThan(3_800);
    expect(waited).toBeLessThan(7_500);
    expect(Math.abs((arrivals[0] ?? 0) - (arrivals[1] ?? 0))).toBeLessThan(500);
    expect(reveals[0]?.reason).toBe('timeout');
    expect(reveals[0]?.results.every((r) => r.outcome === 'no-answer' && r.points === 0)).toBe(
      true,
    );
  },
  SLOW,
);

it(
  'P3: everyone answers early and the question closes at once, not at the clock',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3, secondsPerQuestion: 30 });
    const question = await nextQuestion(players);
    const asked = Date.now();
    answerRight(host, question);
    answerWrong(friend, question);
    const reveal = await nextReveal(players);
    expect(reveal.reason).toBe('all-answered');
    expect(Date.now() - asked).toBeLessThan(2_000);
  },
  QUICK,
);

it(
  'P4: a second answer, even a double click, counts once and is refused in plain words',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    pick(host, question, rightIndex(question));
    pick(host, question, rightIndex(question));
    pick(host, question, (rightIndex(question) + 1) % 4);
    const ack = await host.next('answerAck');
    expect(ack.itemKey).toBe(question.itemKey);
    const first = await host.next('error');
    const second = await host.next('error');
    noteRefusal('P4 answered twice', first);
    expect([first.code, second.code]).toEqual(['ALREADY_ANSWERED', 'ALREADY_ANSWERED']);
    expect(isReadableSentence(first.message, first.code)).toBe(true);
    expect(host.pending('answerAck')).toEqual([]);
    // The room says Ada answered and Bo has not, and the question is still open.
    const room = await friend.nextRoom((r) => r.players.some((p) => p.answered));
    expect(room.phase).toBe('question');
    expect(room.players.map((p) => p.answered)).toEqual([true, false]);
    answerWrong(friend, question);
    const reveal = await nextReveal(players);
    expect(reveal.results.find((r) => r.playerId === host.playerId)).toMatchObject({
      outcome: 'correct',
      points: 1,
      score: 1,
    });
  },
  QUICK,
);

it(
  'P6: picture questions serve a PNG under an opaque name, the parts of a group share one picture',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    start(host, { questionCount: 9 });
    const pictures = new Map<string, string[]>();
    const parts: { index: number; count: number }[] = [];
    for (;;) {
      const arrived = await host.nextAny(['question', 'results'], 30_000);
      if (arrived.type !== 'question') break;
      if (arrived.imageUrl !== undefined) {
        pictures.set(arrived.imageUrl, [...(pictures.get(arrived.imageUrl) ?? []), arrived.prompt]);
        if (arrived.part !== undefined) parts.push(arrived.part);
        expect(arrived.imageUrl).toMatch(/^\/images\/[A-Za-z0-9_~-]+$/);
        expect(arrived.imageUrl).not.toMatch(/feather|flock|perch|nest|\.png|birds|demo/i);
        const response = await fetch(`${HTTP}${arrived.imageUrl}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      }
      for (const player of players) {
        if (KEY[arrived.prompt] !== undefined) answerRight(player, arrived);
      }
      await host.next('reveal', 20_000);
      host.send({ type: 'next' });
    }
    // Two single pictures and one group of three parts that share a picture, in order.
    expect([...pictures.values()].map((prompts) => prompts.length).sort()).toEqual([1, 1, 3]);
    expect(parts).toEqual([
      { index: 1, count: 3 },
      { index: 2, count: 3 },
      { index: 3, count: 3 },
    ]);
    expect((await fetch(`${HTTP}/images/aaaaaaaaaaaaaaaa`)).status).toBe(404);
  },
  SLOW,
);

it(
  'P7: while a question is open, no message carries the answer, the explanation, who is right, or a new score',
  async () => {
    const { players } = await lobby(['Ada', 'Bo', 'Cy']);
    const [host, bo, cy] = players;
    if (host === undefined || bo === undefined || cy === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const forbidden = ['correct', 'explanation', 'acceptedForms', 'near', 'outcome', 'points'];
    let scoresBefore = [0, 0, 0];
    for (let round = 0; round < 3; round += 1) {
      const question = await nextQuestion(players);
      for (const player of players) player.clear();
      const mark = players.map((p) => p.frames.length);
      answerRight(host, question);
      await host.next('answerAck');
      answerWrong(bo, question);
      await bo.next('answerAck');
      // Cy has not answered: the question is open while we read everything sent so far.
      await host.nextRoom((r) => r.players.filter((p) => p.answered).length === 2);
      const openFrames = players.flatMap((p, at) => p.frames.slice(mark[at]));
      for (const frame of openFrames) {
        const parsed = JSON.parse(frame) as Record<string, unknown>;
        expect(['room', 'answerAck']).toContain(parsed.type);
        const text = JSON.stringify(parsed);
        for (const key of forbidden) expect(text, `${key} in ${text}`).not.toContain(`"${key}"`);
        if (parsed.type === 'room') {
          const room = parsed.room as { players: { score: number; id: string }[]; phase: string };
          expect(room.phase).toBe('question');
          expect(room.players.map((p) => p.score)).toEqual(scoresBefore);
        } else {
          expect(Object.keys(parsed).sort()).toEqual(['itemKey', 'type']);
        }
      }
      answerWrong(cy, question);
      const reveal = await nextReveal(players);
      scoresBefore = players.map(
        (p) => reveal.results.find((r) => r.playerId === p.playerId)?.score ?? -1,
      );
      host.send({ type: 'next' });
    }
  },
  SLOW,
);

it(
  'P8: an answer sent just after the question closed is refused in words that say it is too late, and scores nothing',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    answerRight(host, question);
    // Bo does nothing until the clock runs out, then answers (a slow connection).
    const reveal = await nextReveal(players);
    expect(reveal.reason).toBe('timeout');
    await sleep(300);
    answerRight(friend, question);
    const refused = await friend.next('error');
    noteRefusal('P8 late answer', refused);
    expect(refused.code).toBe('STALE_QUESTION');
    expect(isReadableSentence(refused.message, refused.code)).toBe(true);
    // The player must be "told the time was up" (P8), not only that the question has closed.
    expect(refused.message, 'says time was up').toMatch(/time|too late|run out/i);
    // The late answer scored nothing: the last snapshot is still the reveal, Ada 1 and Bo 0. (Not
    // "the next question's snapshot": the first question's own snapshot is also in the queue.)
    await sleep(300);
    const rooms = friend.history.flatMap((m) => (m.type === 'room' ? [m.room] : []));
    const latest = rooms[rooms.length - 1];
    expect(latest?.phase).toBe('reveal');
    expect(latest?.players.map((p) => p.score)).toEqual([1, 0]);
  },
  SLOW,
);
