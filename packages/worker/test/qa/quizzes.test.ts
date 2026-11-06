import { request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { decodeHttpErrorBody, decodeQuizListResponse } from '@quiz-versus/protocol';
import { KEY, playRegular } from './qa-game.js';
import { cleanup, lobby, Player, QUICK, start } from './qa-support.js';

afterEach(cleanup);

/** Several lobbies in a row, each freed before the next (five rooms per address). */
const MANY_LOBBIES = 120_000;

/** Long enough for a nine-question game of 5 s questions played out for real. */
const WHOLE_GAME = 150_000;

interface Raw {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/**
 * One HTTP request exactly as written. `fetch` is not used: it tidies a path such as
 * `/quizzes/../` to `/` before sending, so it would test a different request.
 */
function raw(method: string, path: string, headers: Record<string, string> = {}): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: 8787, path, method, headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * What `content/quizzes/` holds, counted by hand from the files (fake, public content): a picture
 * group counts once per part. Sorted by course folder, then id. `birds-w1-plumage` is 4 questions,
 * 2 single pictures and a group of 3 parts; `rocks-w1-identification` is 12, 2 and 3.
 */
const EXPECTED = [
  {
    id: 'birds-ch2-field-notes',
    course: 'demo-1001',
    title: 'Imaginary Birds: Field Notes',
    scoredParts: 6,
  },
  {
    id: 'birds-w1-plumage',
    course: 'demo-1001',
    title: 'Imaginary Birds: Plumage',
    scoredParts: 9,
  },
  {
    id: 'birds-w2-calls',
    course: 'demo-1001',
    title: 'Imaginary Birds: Calls and Songs',
    scoredParts: 7,
  },
  {
    id: 'rocks-w1-identification',
    course: 'demo-2002',
    title: 'Pretend Minerals: Identification',
    scoredParts: 17,
  },
  {
    id: 'rocks-w2-lab-methods',
    course: 'demo-2002',
    title: 'Pretend Minerals: Lab Methods',
    scoredParts: 6,
  },
] as const;

async function listed(): Promise<typeof EXPECTED> {
  const response = await raw('GET', '/quizzes');
  const decoded = decodeQuizListResponse(response.body);
  if (!decoded.ok) throw new Error(`GET /quizzes body is not a quiz list: ${decoded.detail}`);
  return decoded.message.quizzes as unknown as typeof EXPECTED;
}

it(
  'J7.1: GET /quizzes lists every fake quiz once, with a readable title, its course folder and the scored parts, sorted by course then id',
  async () => {
    const response = await raw('GET', '/quizzes');
    expect(response.status).toBe(200);
    const decoded = decodeQuizListResponse(response.body);
    expect(decoded.ok, decoded.ok ? '' : decoded.detail).toBe(true);
    const quizzes = await listed();
    expect(quizzes).toEqual(EXPECTED);
    const ids = quizzes.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const quiz of quizzes) expect(quiz.title).toMatch(/^[A-Z][\w ]+: [\w ]+$/);
    // `courses.json` sits in the quizzes folder and is not a quiz.
    expect(ids).not.toContain('courses');
  },
  QUICK,
);

it(
  'J7.2: nothing from the questions is in the list: no prompt, answer, option, explanation, picture or file path',
  async () => {
    const { body } = await raw('GET', '/quizzes');
    const decoded = decodeQuizListResponse(body);
    expect(decoded.ok).toBe(true);
    // The strict schema allows four fields per quiz and nothing else.
    const parsed = JSON.parse(body) as { quizzes: Record<string, unknown>[] };
    for (const quiz of parsed.quizzes) {
      expect(Object.keys(quiz).sort()).toEqual(['course', 'id', 'scoredParts', 'title']);
    }
    for (const [prompt, answer] of Object.entries(KEY)) {
      expect(body).not.toContain(prompt);
      expect(body).not.toContain(answer);
    }
    for (const word of [
      'option',
      'correct',
      'explanation',
      'image',
      'images/',
      '.png',
      'Chapter 2',
      '.json',
      'content/',
      'quizzes/',
      'D:\\',
      'C:\\',
    ]) {
      expect(body, word).not.toContain(word);
    }
  },
  QUICK,
);

it(
  'J7.3: two requests give the same bytes, in the same order',
  async () => {
    const first = await raw('GET', '/quizzes');
    const second = await raw('GET', '/quizzes');
    expect(second.body).toBe(first.body);
    expect(Buffer.byteLength(first.body)).toBe(Number(first.headers['content-length']));
  },
  QUICK,
);

it(
  'J7.4: query strings are ignored; a different path is NOT_FOUND with a code-only body, never the list',
  async () => {
    const plain = await raw('GET', '/quizzes');
    for (const path of ['/quizzes?x=1', '/quizzes?', '/quizzes?x=1&y=%00', '/quizzes?/rooms']) {
      const answer = await raw('GET', path);
      expect(answer.status, path).toBe(200);
      expect(answer.body, path).toBe(plain.body);
    }
    const missing = [
      '/quizzes/',
      '/Quizzes',
      '/QUIZZES',
      '/quizzes/../',
      '/quizzes/..',
      '//quizzes',
      '/quizzes%2F',
      '/quizzes%00',
      '/quizzes/birds-w1-plumage',
      '/quizzes.json',
      '/quiz',
      '/',
    ];
    for (const path of missing) {
      const answer = await raw('GET', path);
      expect(answer.status, path).toBe(404);
      expect(answer.body, path).toBe('{"error":"NOT_FOUND"}');
      expect(answer.headers['content-type'], path).toBe('application/json; charset=utf-8');
      expect(answer.body, path).not.toContain('birds-w1-plumage');
    }
  },
  QUICK,
);

it(
  'J7.5: a WebSocket upgrade at /quizzes is refused',
  async () => {
    await expect(Player.open('x', {}, '/quizzes')).rejects.toThrow();
  },
  QUICK,
);

it(
  'J7.6: the response headers: JSON in UTF-8, no sniffing, revalidated each time, no cross-origin header for a request with no Origin',
  async () => {
    const answer = await raw('GET', '/quizzes');
    expect(answer.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
    expect(answer.headers['cache-control']).toBe('no-cache');
    expect(answer.headers['access-control-allow-origin']).toBeUndefined();
    expect(answer.headers['set-cookie']).toBeUndefined();
    // The same two headers on the refusals, so a refusal is never read as a page.
    for (const refused of [
      await raw('GET', '/nowhere'),
      await raw('POST', '/quizzes'),
      await raw('GET', '/quizzes', { Origin: 'https://evil.example' }),
    ]) {
      expect(refused.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(refused.headers['x-content-type-options']).toBe('nosniff');
    }
  },
  QUICK,
);

it(
  'X3.2: GET /quizzes from a page on another origin is refused with a code only; the server’s own origin may read it',
  async () => {
    const plain = await raw('GET', '/quizzes');
    for (const origin of [
      'https://evil.example',
      'null',
      'http://127.0.0.1:8788',
      'http://127.0.0.1',
      'http://127.0.0.1:8787.evil.example',
      '',
    ]) {
      const answer = await raw('GET', '/quizzes', { Origin: origin });
      expect(answer.status, `Origin ${JSON.stringify(origin)}`).toBe(403);
      expect(answer.body).toBe('{"error":"ORIGIN_NOT_ALLOWED"}');
      expect(answer.headers['access-control-allow-origin']).toBeUndefined();
      expect(answer.body).not.toContain('birds');
    }
    const own = await raw('GET', '/quizzes', { Origin: 'http://127.0.0.1:8787' });
    expect(own.status).toBe(200);
    expect(own.body).toBe(plain.body);
    expect(own.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8787');
    expect(own.headers['vary']).toMatch(/Origin/i);
    // What `qa:start` prints is `localhost`: a page opened there sends that Host and Origin.
    const localhost = await raw('GET', '/quizzes', {
      Host: 'localhost:8787',
      Origin: 'http://localhost:8787',
    });
    expect(localhost.status).toBe(200);
    expect(localhost.headers['access-control-allow-origin']).toBe('http://localhost:8787');
  },
  QUICK,
);

it(
  'X12.2: the wrong method on a known path is 405 with an Allow header naming the one method, and a code-only body',
  async () => {
    const cases: [string, string, string][] = [
      ['POST', '/quizzes', 'GET'],
      ['DELETE', '/quizzes', 'GET'],
      ['PUT', '/quizzes', 'GET'],
      ['PATCH', '/quizzes', 'GET'],
      ['POST', '/quizzes?x=1', 'GET'],
      ['GET', '/rooms', 'POST'],
      ['DELETE', '/rooms', 'POST'],
      ['PUT', '/rooms', 'POST'],
    ];
    for (const [method, path, allow] of cases) {
      const answer = await raw(method, path);
      expect(answer.status, `${method} ${path}`).toBe(405);
      expect(answer.headers['allow'], `${method} ${path}`).toBe(allow);
      expect(answer.body).toBe('{"error":"METHOD_NOT_ALLOWED"}');
      expect(decodeHttpErrorBody(answer.body).ok).toBe(true);
    }
    // A picture route takes GET only.
    const picture = await raw('POST', '/images/aaaaaaaaaaaaaaaa');
    expect(picture.status).toBe(405);
    expect(picture.headers['allow']).toBe('GET');
    // A room was not made by any of the refused requests.
    const created = await raw('POST', '/rooms');
    expect(created.status).toBe(201);
    const { roomId } = JSON.parse(created.body) as { roomId: string };
    const tidy = await Player.open(roomId);
    await tidy.join('Tidy');
  },
  QUICK,
);

it(
  'X12.3: every refusal body of the HTTP routes is a code from the protocol list, nothing else (no path, stack or file name)',
  async () => {
    const answers = [
      await raw('GET', '/nowhere'),
      await raw('POST', '/quizzes'),
      await raw('GET', '/rooms'),
      await raw('GET', '/quizzes', { Origin: 'https://evil.example' }),
      await raw('POST', '/rooms', { Origin: 'https://evil.example' }),
      await raw('GET', '/images/aaaaaaaaaaaaaaaa'),
      await raw('GET', '/images/../../package.json'),
    ];
    for (const answer of answers) {
      const decoded = decodeHttpErrorBody(answer.body);
      expect(decoded.ok, answer.body).toBe(true);
      expect(Object.keys(JSON.parse(answer.body) as object)).toEqual(['error']);
    }
  },
  QUICK,
);

it(
  'X8.2: every quiz in the list can be used in `start`: exactly its scoredParts is accepted, one more is refused in a sentence about the questions',
  async () => {
    const problems: string[] = [];
    const quizzes = await listed();
    expect(quizzes).toHaveLength(EXPECTED.length);
    for (const quiz of quizzes) {
      const { players } = await lobby(['Ada', 'Bo']);
      const [host] = players;
      if (host === undefined) throw new Error('no host');
      start(host, { quizIds: [quiz.id], questionCount: quiz.scoredParts + 1 });
      const refusal = await host.next('error');
      if (refusal.code !== 'INVALID_SETTINGS' || !/question/i.test(refusal.message)) {
        problems.push(`${quiz.id}: ${String(quiz.scoredParts + 1)} questions gave ${refusal.code}`);
      }
      start(host, { quizIds: [quiz.id], questionCount: quiz.scoredParts });
      const arrived = await host.nextAny(['question', 'error']);
      if (arrived.type !== 'question') {
        problems.push(
          `${quiz.id}: its own scoredParts ${String(quiz.scoredParts)} was refused: ${arrived.type === 'error' ? `${arrived.code} ${arrived.message}` : arrived.type}`,
        );
      } else if (
        arrived.progress.kind !== 'regular' ||
        arrived.progress.totalItems !== quiz.scoredParts
      ) {
        problems.push(`${quiz.id}: the game says ${JSON.stringify(arrived.progress)}`);
      }
      await cleanup();
    }
    expect(problems).toEqual([]);
  },
  MANY_LOBBIES,
);

it(
  'X8.3: every listed quiz also starts with typed answers, and all of them together start one game of their summed parts',
  async () => {
    const quizzes = await listed();
    expect(quizzes).toHaveLength(EXPECTED.length);
    const problems: string[] = [];
    for (const quiz of quizzes.filter((q) => q.course === 'demo-2002')) {
      const { players } = await lobby(['Ada', 'Bo']);
      const [host] = players;
      if (host === undefined) throw new Error('no host');
      start(host, { quizIds: [quiz.id], questionCount: quiz.scoredParts, answerBy: 'type' });
      const arrived = await host.nextAny(['question', 'error']);
      if (arrived.type !== 'question') problems.push(`${quiz.id} by typing: ${arrived.type}`);
      await cleanup();
    }
    const total = quizzes.reduce((sum, q) => sum + q.scoredParts, 0);
    const { players } = await lobby(['Ada', 'Bo']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    start(host, { quizIds: quizzes.map((q) => q.id), questionCount: total + 1 });
    const tooMany = await host.next('error');
    if (tooMany.code !== 'INVALID_SETTINGS') problems.push(`all + 1 gave ${tooMany.code}`);
    start(host, { quizIds: quizzes.map((q) => q.id), questionCount: total });
    const all = await host.nextAny(['question', 'error']);
    if (all.type !== 'question') {
      problems.push(`all ${String(total)} parts: ${all.type === 'error' ? all.message : all.type}`);
    } else if (all.progress.kind !== 'regular' || all.progress.totalItems !== total) {
      problems.push(`all quizzes: the game says ${JSON.stringify(all.progress)}`);
    }
    expect(problems).toEqual([]);
  },
  MANY_LOBBIES,
);

it(
  'J7.7: a game on a quiz with a picture group plays exactly as many questions as the list says, each part once, the parts in order',
  async () => {
    const plumage = (await listed()).find((q) => q.id === 'birds-w1-plumage');
    if (plumage === undefined) throw new Error('birds-w1-plumage is not in the list');
    const { players } = await lobby(['Ada', 'Bo']);
    const [host] = players;
    if (host === undefined) throw new Error('no host');
    start(host, { quizIds: [plumage.id], questionCount: plumage.scoredParts });
    // Ada answers every question right and Bo none, so the game ends without a tie-break.
    const { questions, results } = await playRegular(players, (_question, _round, who) =>
      who === 0 ? 'right' : 'none',
    );
    expect(questions).toHaveLength(plumage.scoredParts);
    expect(new Set(questions.map((q) => q.prompt)).size).toBe(plumage.scoredParts);
    expect(questions.every((q) => q.progress.kind === 'regular')).toBe(true);
    const parts = questions.flatMap((q) => (q.part === undefined ? [] : [q.part]));
    expect(parts).toEqual([
      { index: 1, count: 3 },
      { index: 2, count: 3 },
      { index: 3, count: 3 },
    ]);
    expect(results.standings[0]?.score).toBeGreaterThan(0);
  },
  WHOLE_GAME,
);
