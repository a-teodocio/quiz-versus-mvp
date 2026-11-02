import { afterEach, describe, expect, it } from 'vitest';
import type { GameSettings, ServerMessage } from '@quiz-versus/protocol';
import { TestServer } from './support/test-server.js';
import type { TestClient } from './support/test-client.js';

let server: TestServer;

afterEach(async () => {
  await server.stop();
});

const settings = (overrides: Partial<GameSettings> = {}): GameSettings => ({
  quizIds: ['birds-w1-plumage'],
  questionCount: 9,
  secondsPerQuestion: 20,
  answerBy: 'pick',
  ...overrides,
});

/** A room with a host and a friend, both joined. */
async function twoPlayers(): Promise<{ roomId: string; host: TestClient; friend: TestClient }> {
  server = await new TestServer().start();
  const roomId = await server.createRoom();
  const host = await server.join(roomId, 'Ada');
  const friend = await server.join(roomId, 'Bo');
  return { roomId, host, friend };
}

/** Plays out any tie-break questions by letting them time out, and returns the results. */
async function finishGame(host: TestClient): Promise<Extract<ServerMessage, { type: 'results' }>> {
  for (;;) {
    const message = await host.nextAny(['results', 'question']);
    if (message.type === 'results') return message;
    if (message.type !== 'question') throw new Error('expected a question or the results');
    server.time.advance(message.durationMs);
    await host.next('reveal');
    host.send({ type: 'next' });
  }
}

describe('a whole game over real sockets', () => {
  it('plays from the lobby to the results, answering and timing out', async () => {
    const { host, friend } = await twoPlayers();
    host.send({ type: 'start', settings: settings({ questionCount: 3 }) });
    const first = await friend.next('question');
    expect((await host.next('question')).itemKey).toBe(first.itemKey);

    host.send({ type: 'answer', itemKey: first.itemKey, answer: { kind: 'pick', index: 0 } });
    expect((await host.next('answerAck')).itemKey).toBe(first.itemKey);
    friend.send({ type: 'answer', itemKey: first.itemKey, answer: { kind: 'pick', index: 1 } });
    const firstReveal = await host.next('reveal');
    expect(firstReveal.reason).toBe('all-answered');

    for (let round = 2; round <= 3; round += 1) {
      host.send({ type: 'next' });
      const question = await host.next('question');
      expect(question.progress).toMatchObject({ position: round });
      server.time.advance(question.durationMs);
      expect((await host.next('reveal')).reason).toBe('timeout');
    }
    host.send({ type: 'next' });
    const results = await finishGame(host);
    expect(results.standings.map((standing) => standing.name).sort()).toEqual(['Ada', 'Bo']);
  });
});

describe('who may do what over real sockets', () => {
  it('refuses a start from the friend and a next from the friend', async () => {
    const { host, friend } = await twoPlayers();
    friend.send({ type: 'start', settings: settings() });
    expect((await friend.next('error')).code).toBe('NOT_HOST');
    host.send({ type: 'start', settings: settings({ questionCount: 3 }) });
    const question = await friend.next('question');
    server.time.advance(question.durationMs);
    await friend.next('reveal');
    friend.send({ type: 'next' });
    expect((await friend.next('error')).code).toBe('NOT_HOST');
  });

  it('puts a player who lost the connection back in the game with the same seat', async () => {
    const { roomId, host, friend } = await twoPlayers();
    host.send({ type: 'start', settings: settings({ questionCount: 3 }) });
    const question = await friend.next('question');
    friend.drop();
    const afterDrop = await host.nextRoom((room) => room.players.some((p) => !p.connected));
    expect(afterDrop.players.find((p) => p.name === 'Bo')?.connected).toBe(false);

    server.time.advance(5_000);
    const back = await server.open(roomId);
    await back.join('Bo', friend.resumeToken);
    expect(back.playerId).toBe(friend.playerId);
    const resumed = await back.next('question');
    expect(resumed.itemKey).toBe(question.itemKey);
    expect(resumed.durationMs).toBe(question.durationMs - 5_000);
    const room = await host.nextRoom((snapshot) => snapshot.players.every((p) => p.connected));
    expect(room.players).toHaveLength(2);
  });

  it('closes the older socket when the same seat is taken from a second tab', async () => {
    const { roomId, friend } = await twoPlayers();
    const second = await server.open(roomId);
    await second.join('Bo', friend.resumeToken);
    expect(await friend.closed).toBe(4001);
    expect(second.playerId).toBe(friend.playerId);
  });

  it('removes a player who leaves and hands the host role over when the host leaves', async () => {
    const { host, friend } = await twoPlayers();
    host.send({ type: 'leave' });
    expect(await host.closed).toBe(1000);
    const room = await friend.nextRoom((snapshot) => snapshot.players.length === 1);
    expect(room.hostId).toBe(friend.playerId);
    expect(room.players.map((player) => player.name)).toEqual(['Bo']);
  });

  it('closes the room and every socket when the last player leaves', async () => {
    const { roomId, host, friend } = await twoPlayers();
    host.send({ type: 'leave' });
    friend.send({ type: 'leave' });
    expect(await friend.closed).toBe(1000);
    expect(server.roomCount).toBe(0);
    const late = await server.open(roomId);
    expect((await late.next('error')).code).toBe('ROOM_NOT_FOUND');
  });
});

describe('pictures', () => {
  /** Plays on until a question with a picture comes up, and returns its address. */
  async function untilPicture(host: TestClient): Promise<string> {
    for (let round = 0; round < 9; round += 1) {
      const question = await host.next('question');
      if (question.imageUrl !== undefined) return question.imageUrl;
      server.time.advance(question.durationMs);
      await host.next('reveal');
      host.send({ type: 'next' });
    }
    throw new Error('the game had no picture question');
  }

  it('serves the picture under the name the question carries, and nothing else', async () => {
    const { host } = await twoPlayers();
    host.send({ type: 'start', settings: settings() });
    const imageUrl = await untilPicture(host);
    expect(imageUrl).toMatch(/^\/images\/[a-z0-9]{16}$/);

    const response = await server.request(imageUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...new Uint8Array(await response.arrayBuffer()).subarray(0, 4)]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect((await server.request('/images/aaaaaaaaaaaaaaaa')).status).toBe(404);
  });

  it('stops serving a game’s pictures when its room closes', async () => {
    const { host, friend } = await twoPlayers();
    host.send({ type: 'start', settings: settings() });
    const imageUrl = await untilPicture(host);
    expect((await server.request(imageUrl)).status).toBe(200);
    host.send({ type: 'leave' });
    friend.send({ type: 'leave' });
    await friend.closed;
    expect((await server.request(imageUrl)).status).toBe(404);
  });

  it('never puts the picture’s file name in the address', async () => {
    const { host } = await twoPlayers();
    host.send({ type: 'start', settings: settings() });
    const imageUrl = await untilPicture(host);
    expect(imageUrl).not.toMatch(/feather|flock|nest|perch|\.png/);
  });
});

describe('shutting down', () => {
  it('closes every room and socket, and stops listening', async () => {
    const { host, friend } = await twoPlayers();
    const port = server.port;
    await server.stop();
    expect(await host.closed).toBeDefined();
    expect(await friend.closed).toBeDefined();
    await expect(
      fetch(`http://127.0.0.1:${String(port)}/rooms`, { method: 'POST' }),
    ).rejects.toThrow();
  });
});
