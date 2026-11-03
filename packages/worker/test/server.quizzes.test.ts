// `GET /quizzes` and the other HTTP bodies the server writes with the protocol: the quiz list,
// the refusals, the wrong-method answers and the 500 path.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeHttpErrorBody,
  decodeQuizListResponse,
  type QuizListResponse,
} from '@quiz-versus/protocol';
import { createDiskQuizRepository } from '../src/content/disk-quiz-repository.js';
import { ImageIndex } from '../src/content/image-index.js';
import { createImageStore } from '../src/content/image-store.js';
import { createRequestHandler } from '../src/net/http-routes.js';
import type { RoomRegistry } from '../src/rooms/room-registry.js';
import { fakeContentRoot } from './support/content-root.js';
import { TestServer } from './support/test-server.js';

let server: TestServer;

afterEach(async () => {
  await server.stop();
});

const QUIZ_FOLDER = join(fakeContentRoot, 'quizzes');

interface FakeFile {
  title: string;
  questions: { type: string; parts?: unknown[] }[];
}

/** Every fake quiz file read straight from disk, by id, with the course folder it sits in. */
const files = readdirSync(QUIZ_FOLDER, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((course) =>
    readdirSync(join(QUIZ_FOLDER, course.name))
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({
        id: name.slice(0, -'.json'.length),
        course: course.name,
        file: JSON.parse(readFileSync(join(QUIZ_FOLDER, course.name, name), 'utf8')) as FakeFile,
      })),
  );

const GOOD_QUIZ = JSON.stringify({
  questions: [
    {
      type: 'text',
      id: 'q1',
      question: 'Q?',
      options: ['a', 'b', 'c', 'd'],
      correct: 0,
      explanation: 'E.',
    },
  ],
});

describe('the quiz list', () => {
  it('lists every playable quiz with its course, title and scored parts, sorted', async () => {
    server = await new TestServer().start();
    const response = await server.request('/quizzes');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const decoded = decodeQuizListResponse(await response.text());
    if (!decoded.ok) throw new Error(decoded.detail);
    const expected = files
      .map(({ id, course, file }) => ({
        id,
        course,
        title: file.title,
        scoredParts: file.questions.reduce(
          (sum, q) => sum + (q.type === 'image-group' ? (q.parts ?? []).length : 1),
          0,
        ),
      }))
      .sort((a, b) => a.course.localeCompare(b.course) || a.id.localeCompare(b.id));
    expect(decoded.message.quizzes).toEqual(expected);
    expect(expected.length).toBeGreaterThan(1);
  });

  it('counts a picture group once per part, not once', async () => {
    server = await new TestServer().start();
    const { quizzes } = (await (await server.request('/quizzes')).json()) as QuizListResponse;
    const plumage = quizzes.find((quiz) => quiz.id === 'birds-w1-plumage');
    const entries = files.find(({ id }) => id === 'birds-w1-plumage')?.file.questions.length ?? 0;
    expect(plumage?.scoredParts).toBeGreaterThan(entries);
  });

  it('lists only ids that can be started, and holds nothing from the questions', async () => {
    server = await new TestServer().start();
    const text = await (await server.request('/quizzes')).text();
    const repository = createDiskQuizRepository(fakeContentRoot);
    const decoded = decodeQuizListResponse(text);
    if (!decoded.ok) throw new Error(decoded.detail);
    for (const { id } of decoded.message.quizzes) {
      expect((await repository.load(id))?.entries.length, id).toBeGreaterThan(0);
    }
    for (const word of ['correct', 'explanation', 'options', 'image_path']) {
      expect(text, word).not.toContain(word);
    }
  });
});

describe('the quiz list and what is wrong around it', () => {
  it('leaves a bad quiz file out, says so in the log, and still lists the rest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quiz-versus-list-'));
    try {
      mkdirSync(join(root, 'quizzes', 'c1'), { recursive: true });
      writeFileSync(join(root, 'quizzes', 'c1', 'fine.json'), GOOD_QUIZ);
      writeFileSync(join(root, 'quizzes', 'c1', 'broken.json'), '{ nope');
      writeFileSync(join(root, 'quizzes', 'c1', 'empty.json'), '{"questions":[]}');
      server = await new TestServer().start({ contentRoot: root });
      const { quizzes } = (await (await server.request('/quizzes')).json()) as QuizListResponse;
      expect(quizzes).toEqual([{ id: 'fine', course: 'c1', title: 'fine', scoredParts: 1 }]);
      const skipped = server.logLines.filter((line) => line.includes('content.quiz-skipped'));
      expect(skipped).toHaveLength(2);
      expect(skipped.join('\n')).toContain('broken');
      expect(skipped.join('\n')).toContain('it has no questions');
      expect(skipped.join('\n')).not.toContain('nope');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses another website, and lets a listed origin read the answer', async () => {
    server = await new TestServer().start({ allowedOrigins: ['http://localhost:5173'] });
    const stranger = await server.request('/quizzes', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toEqual({ error: 'ORIGIN_NOT_ALLOWED' });
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull();
    const listed = await server.request('/quizzes', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(listed.status).toBe(200);
    expect(listed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(listed.headers.get('vary')).toBe('Origin');
  });
});

describe('a request with the wrong method', () => {
  it.each([
    ['POST', '/quizzes', 'GET'],
    ['DELETE', '/quizzes', 'GET'],
    ['GET', '/rooms', 'POST'],
    ['PUT', '/rooms', 'POST'],
    ['POST', '/images/some-alias', 'GET'],
  ])('%s %s answers 405 and names the method the route takes', async (method, path, allow) => {
    server = await new TestServer().start();
    const response = await server.request(path, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe(allow);
    expect(await response.json()).toEqual({ error: 'METHOD_NOT_ALLOWED' });
  });
});

describe('refusals', () => {
  it('writes the 403, 404, 405 and 503 bodies with the protocol, with CORS on the 503', async () => {
    server = await new TestServer().start({
      maxRooms: 1,
      allowedOrigins: ['http://localhost:5173'],
    });
    await server.createRoom();
    const full = await server.request('/rooms', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(full.status).toBe(503);
    expect(full.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const refusals = [
      full,
      await server.request('/rooms', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
      await server.request('/nowhere'),
      await server.request('/quizzes', { method: 'POST' }),
    ];
    for (const response of refusals) {
      expect(decodeHttpErrorBody(await response.text()).ok, String(response.status)).toBe(true);
    }
  });
});

describe('a fault', () => {
  it('answers 500 with INTERNAL_ERROR, and logs the kind of fault and nothing else', async () => {
    server = await new TestServer().start();
    const logged: string[] = [];
    const registry = {
      create: () => {
        throw new TypeError('secret detail');
      },
    } as unknown as RoomRegistry;
    const http = createServer(
      createRequestHandler({
        allowedOrigins: [],
        registry,
        images: new ImageIndex(),
        quizListBody: '{"quizzes":[]}',
        imageStore: createImageStore(fakeContentRoot),
        logger: {
          info: () => undefined,
          error: (event, fields) => logged.push(`${event} ${JSON.stringify(fields)}`),
        },
      }),
    );
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = http.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${String(port)}/rooms`, { method: 'POST' });
      expect(response.status).toBe(500);
      expect(decodeHttpErrorBody(await response.text())).toEqual({
        ok: true,
        message: { error: 'INTERNAL_ERROR' },
      });
      expect(logged).toEqual(['http.fault {"error":"TypeError"}']);
    } finally {
      await new Promise<void>((resolve) => {
        http.close(() => {
          resolve();
        });
      });
    }
  });
});
