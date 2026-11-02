import { request } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { answerRight, nextQuestion, nextReveal, pick } from './qa-game.js';
import {
  cleanup,
  createRoom,
  isReadableSentence,
  lobby,
  noteRefusal,
  Player,
  QUICK,
  SLOW,
  sleep,
  start,
} from './qa-support.js';
import type { settings } from './qa-support.js';

afterEach(cleanup);

const sendHello = (p: Player): void => {
  p.sendRaw('hello');
};
const sendArray = (p: Player): void => {
  p.sendRaw('[]');
};
const sendShout = (p: Player): void => {
  p.send({ type: 'shout' });
};
const sendNext = (p: Player): void => {
  p.send({ type: 'next' });
};
const sendExtraField = (p: Player): void => {
  p.send({ type: 'join', protocolVersion: 3, name: 'X', isHost: true });
};
const sendOtherVersion = (p: Player): void => {
  p.send({ type: 'join', protocolVersion: 99, name: 'X' });
};

/** POST /rooms with an Origin header (fetch may hide it, so this goes through node:http). */
function postRoom(origin?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: 8787,
        path: '/rooms',
        method: 'POST',
        headers: origin === undefined ? {} : { Origin: origin },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

it(
  'X1: not JSON, unknown fields, unknown types, before joining, a second join: each refused with a code and a sentence, the server and others unaffected',
  async () => {
    const { roomId, players } = await lobby(['Ada']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    host.clear();
    const cases: [string, (p: Player) => void, string][] = [
      ['not JSON', sendHello, 'MALFORMED_MESSAGE'],
      ['an array', sendArray, 'MALFORMED_MESSAGE'],
      ['unknown type', sendShout, 'MALFORMED_MESSAGE'],
      ['next before joining', sendNext, 'NOT_JOINED'],
      ['join with an extra field', sendExtraField, 'MALFORMED_MESSAGE'],
      ['join with another version', sendOtherVersion, 'UNSUPPORTED_VERSION'],
    ];
    for (const [label, act, expected] of cases) {
      const probe = await Player.open(roomId);
      act(probe);
      const error = await probe.next('error');
      noteRefusal(`X1 ${label}`, error);
      expect(error.code, label).toBe(expected);
      expect(isReadableSentence(error.message, error.code), `${label}: ${error.message}`).toBe(
        true,
      );
      if (label === 'join with another version') expect(await probe.closed).toBe(1008);
    }
    const joined = await Player.open(roomId);
    await joined.join('Bo');
    joined.send({ type: 'join', protocolVersion: 3, name: 'Again' });
    expect((await joined.next('error')).code).toBe('ALREADY_JOINED');
    await sleep(300);
    expect(host.pending('error')).toEqual([]);
  },
  QUICK,
);

it(
  'X1.2: a message over 2 KiB gets MESSAGE_TOO_LARGE and stays connected; a frame over 4 KiB closes the connection; others are unaffected',
  async () => {
    const { roomId, players } = await lobby(['Ada']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    const big = await Player.open(roomId);
    await big.join('Big');
    big.sendRaw(JSON.stringify({ type: 'join', protocolVersion: 3, name: 'x'.repeat(3_000) }));
    const error = await big.next('error');
    noteRefusal('X1 message of 3000 bytes', error);
    expect(error.code).toBe('MESSAGE_TOO_LARGE');
    expect(isReadableSentence(error.message, error.code)).toBe(true);
    expect(big.isOpen).toBe(true);
    big.sendRaw('x'.repeat(10_000));
    expect(await big.closed).toBe(1009);
    await host.nextRoom((r) => r.players.some((p) => !p.connected));
    expect(host.isOpen).toBe(true);
  },
  QUICK,
);

it(
  'X1.3: a binary frame is refused in a sentence and the connection stays usable',
  async () => {
    const { roomId } = await lobby(['Ada']);
    const probe = await Player.open(roomId);
    probe.sendBinary(new Uint8Array([1, 2, 3]));
    const error = await probe.next('error');
    noteRefusal('X1 binary frame', error);
    expect(error.code).toBe('MALFORMED_MESSAGE');
    expect(isReadableSentence(error.message, error.code)).toBe(true);
    expect((await probe.tryJoin('Bo')).type).toBe('welcome');
  },
  QUICK,
);

it(
  'X1.4: a socket that never joins is told and closed within about ten seconds',
  async () => {
    const { roomId } = await lobby(['Ada']);
    const idle = await Player.open(roomId);
    const error = await idle.next('error', 15_000);
    noteRefusal('X1 never joined', error);
    expect(error.code).toBe('NOT_JOINED');
    expect(await idle.closed).toBe(1008);
  },
  QUICK,
);

it(
  'X2: a client that floods is rate limited, then closed; another player notices nothing',
  async () => {
    const { roomId, players } = await lobby(['Ada']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    host.clear();
    const flood = await Player.open(roomId);
    await flood.join('Flood');
    for (let n = 0; n < 70; n += 1) flood.sendRaw('{}');
    expect(await flood.closed).toBe(1008);
    const errors = flood.history.flatMap((m) => (m.type === 'error' ? [m] : []));
    const limited = errors.find((m) => m.code === 'RATE_LIMITED');
    expect(limited).toBeDefined();
    expect(isReadableSentence(limited?.message ?? '', 'RATE_LIMITED')).toBe(true);
    // Ada still works.
    start(host);
    expect((await host.next('error')).code).not.toBe('RATE_LIMITED');
  },
  QUICK,
);

it(
  'X3: a connection or a room request from a page on another origin is refused; the server’s own origin and no origin are allowed',
  async () => {
    const roomId = await createRoom();
    await expect(
      Player.open(roomId, { headers: { Origin: 'https://evil.example' } }),
    ).rejects.toThrow(/403/);
    await expect(Player.open(roomId, { headers: { Origin: 'null' } })).rejects.toThrow(/403/);
    await expect(
      Player.open(roomId, { headers: { Origin: 'http://127.0.0.1:8788' } }),
    ).rejects.toThrow(/403/);
    const own = await Player.open(roomId, { headers: { Origin: 'http://127.0.0.1:8787' } });
    expect((await own.tryJoin('Ada')).type).toBe('welcome');
    const evil = await postRoom('https://evil.example');
    expect(evil.status).toBe(403);
    const none = await postRoom();
    expect(none.status).toBe(201);
    const nullOrigin = await postRoom('null');
    expect(nullOrigin.status).toBe(403);
    // A room made by a script with no Origin must be freed, or the cap of 5 would be used up.
    const created = (JSON.parse(none.body) as { roomId: string }).roomId;
    const tidy = await Player.open(created);
    await tidy.join('Tidy');
  },
  QUICK,
);

it(
  'X4: a stale item key, an answer in the lobby, and an answer after the reveal are refused in words, and the game goes on',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    host.send({ type: 'answer', itemKey: 'i1', answer: { kind: 'pick', index: 0 } });
    const lobbyRefusal = await host.next('error');
    noteRefusal('X4 answer in the lobby', lobbyRefusal);
    expect(lobbyRefusal.code).toBe('WRONG_PHASE');
    expect(isReadableSentence(lobbyRefusal.message, lobbyRefusal.code)).toBe(true);
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    host.send({ type: 'answer', itemKey: 'i999', answer: { kind: 'pick', index: 0 } });
    const stale = await host.next('error');
    noteRefusal('X4 stale item key', stale);
    expect(stale.code).toBe('STALE_QUESTION');
    host.send({ type: 'answer', itemKey: question.itemKey, answer: { kind: 'pick', index: 7 } });
    expect((await host.next('error')).code).toBe('MALFORMED_MESSAGE');
    answerRight(host, question);
    pick(friend, question, 0);
    await nextReveal(players);
    pick(friend, question, 1);
    const closed = await friend.next('error');
    noteRefusal('X4 answer during reveal', closed);
    expect(closed.code).toBe('STALE_QUESTION');
    host.send({ type: 'next' });
    expect((await nextQuestion(players)).progress).toMatchObject({ position: 2 });
  },
  QUICK,
);

it(
  'X6: start while a game is running is refused for the host (WRONG_PHASE) and the guest (NOT_HOST); `next` during a question is refused',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host, friend] = players;
    if (host === undefined || friend === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    start(host, { questionCount: 3 });
    const again = await host.next('error');
    noteRefusal('X6 second start by the host', again);
    expect(again.code).toBe('WRONG_PHASE');
    expect(isReadableSentence(again.message, again.code)).toBe(true);
    start(friend);
    expect((await friend.next('error')).code).toBe('NOT_HOST');
    host.send({ type: 'next' });
    const early = await host.next('error');
    noteRefusal('X6 next during a question', early);
    expect(early.code).toBe('WRONG_PHASE');
    expect(isReadableSentence(early.message, early.code)).toBe(true);
    // The game is untouched: the same question is still open for both.
    answerRight(host, question);
    answerRight(friend, question);
    expect((await nextReveal(players)).itemKey).toBe(question.itemKey);
  },
  QUICK,
);

it(
  'X7: two starts back to back start one game, and the second is refused in a sentence',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    start(host, { questionCount: 3 });
    start(host, { questionCount: 3 });
    const error = await host.next('error');
    noteRefusal('X7 start twice', error);
    expect(isReadableSentence(error.message, error.code)).toBe(true);
    await host.next('question');
    await sleep(500);
    expect(host.pending('question')).toEqual([]);
  },
  QUICK,
);

it(
  'X8: settings the host cannot have are refused in a sentence that says which setting, and the lobby stays usable',
  async () => {
    const { players } = await lobby(['Ada', 'Bo']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    // [label, settings, whether a person could cause it (so the sentence must name the setting)]
    const bad: [string, Parameters<typeof settings>[0], boolean][] = [
      ['unknown quiz', { quizIds: ['no-such-quiz'] }, true],
      ['more questions than exist', { questionCount: 99 }, true],
      ['zero questions', { questionCount: 0 }, false],
      ['4 seconds', { secondsPerQuestion: 4 }, false],
      ['121 seconds', { secondsPerQuestion: 121 }, false],
      ['no quizzes', { quizIds: [] }, false],
      ['a path as a quiz id', { quizIds: ['../../secrets'] }, false],
    ];
    const problems: string[] = [];
    for (const [label, overrides, byAPerson] of bad) {
      start(host, overrides);
      const error = await host.next('error');
      noteRefusal(`X8 ${label}`, error);
      if (!isReadableSentence(error.message, error.code)) {
        problems.push(`${label}: not a readable sentence: ${error.message}`);
      }
      if (byAPerson && !/quiz|question/i.test(error.message)) {
        problems.push(`${label}: does not say which setting (${error.code}: ${error.message})`);
      }
    }
    expect(problems).toEqual([]);
    start(host, { questionCount: 3 });
    await host.next('question');
  },
  QUICK,
);

it(
  'X9: the host leaves in the middle of a question; the question carries on and another player becomes host',
  async () => {
    const { players } = await lobby(['Ada', 'Bo', 'Cy']);
    const [host, bo, cy] = players;
    if (host === undefined || bo === undefined || cy === undefined) throw new Error('no players');
    start(host, { questionCount: 3 });
    const question = await nextQuestion(players);
    host.leave();
    // Not "two players": lobby snapshots with only Ada and Bo are still queued. Wait for the
    // snapshot in which the old host is gone.
    const room = await bo.nextRoom((r) => !r.players.some((p) => p.id === host.playerId));
    expect(room.players).toHaveLength(2);
    expect(room.hostId).toBe(bo.playerId);
    expect(room.phase).toBe('question');
    answerRight(bo, question);
    answerRight(cy, question);
    const reveal = await bo.next('reveal');
    expect(reveal.results.map((r) => r.playerId).sort()).toEqual([bo.playerId, cy.playerId].sort());
    bo.send({ type: 'next' });
    expect((await nextQuestion([bo, cy])).progress).toMatchObject({ position: 2 });
  },
  QUICK,
);

it(
  'X10: one address may open five rooms; the sixth is refused with a code; closing a room frees a place',
  async () => {
    const rooms: string[] = [];
    for (let n = 0; n < 5; n += 1) rooms.push(await createRoom());
    const sixth = await fetch('http://127.0.0.1:8787/rooms', { method: 'POST' });
    expect(sixth.status).toBe(503);
    const body = (await sixth.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: 'TOO_MANY_ROOMS' });
    // Free the rooms: one player joins each and leaves.
    for (const roomId of rooms) {
      const p = await Player.open(roomId);
      await p.join('Tidy');
      p.leave();
      await p.closed;
    }
    const seventh = await fetch('http://127.0.0.1:8787/rooms', { method: 'POST' });
    expect(seventh.status).toBe(201);
    const last = await Player.open(((await seventh.json()) as { roomId: string }).roomId);
    await last.join('Tidy');
  },
  QUICK,
);

it(
  'X11: a stranger cannot guess their way into a room: a short or well-formed but unknown id gets room-not-found, never a seat',
  async () => {
    const probe = await Player.open('B'.repeat(22));
    const error = await probe.next('error');
    expect(error.code).toBe('ROOM_NOT_FOUND');
    await expect(Player.open('x', {}, '/rooms/short')).rejects.toThrow(/404/);
  },
  SLOW,
);
