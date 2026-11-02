import { afterEach, describe, expect, it } from 'vitest';
import { OPAQUE_ID_MIN_LENGTH } from '@quiz-versus/protocol';
import { TestServer } from './support/test-server.js';
import { TestClient, UpgradeRefused } from './support/test-client.js';

let server: TestServer;

afterEach(async () => {
  await server.stop();
});

describe('making a room', () => {
  it('answers 201 with an id the protocol accepts as unguessable', async () => {
    server = await new TestServer().start();
    const response = await server.request('/rooms', { method: 'POST' });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { roomId: string };
    expect(body.roomId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.roomId.length).toBeGreaterThanOrEqual(OPAQUE_ID_MIN_LENGTH);
    expect(server.roomCount).toBe(1);
  });

  it('stops at the cap on rooms, and at the cap per address', async () => {
    server = await new TestServer().start({ maxRooms: 2, maxRoomsPerAddress: 5 });
    await server.createRoom();
    await server.createRoom();
    const full = await server.request('/rooms', { method: 'POST' });
    expect(full.status).toBe(503);
    expect(await full.json()).toEqual({ error: 'SERVER_FULL' });
    await server.stop();

    server = await new TestServer().start({ maxRooms: 50, maxRoomsPerAddress: 1 });
    await server.createRoom();
    const greedy = await server.request('/rooms', { method: 'POST' });
    expect(greedy.status).toBe(503);
    expect(await greedy.json()).toEqual({ error: 'TOO_MANY_ROOMS' });
  });

  it('makes room again once a room has closed', async () => {
    server = await new TestServer().start({ maxRooms: 1, idleRoomMs: 5_000 });
    await server.createRoom();
    server.time.advance(5_000);
    expect(server.roomCount).toBe(0);
    expect((await server.request('/rooms', { method: 'POST' })).status).toBe(201);
  });
});

describe('origin check', () => {
  it('refuses a room made from another website, and allows the server’s own page', async () => {
    server = await new TestServer().start();
    const stranger = await server.request('/rooms', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(stranger.status).toBe(403);
    expect(server.roomCount).toBe(0);
    const own = await server.request('/rooms', {
      method: 'POST',
      headers: { Origin: server.origin },
    });
    expect(own.status).toBe(201);
  });

  it('allows a listed origin and lets that page read the answer', async () => {
    server = await new TestServer().start({ allowedOrigins: ['http://localhost:5173'] });
    const response = await server.request('/rooms', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('refuses a WebSocket upgrade from another website', async () => {
    server = await new TestServer().start();
    const roomId = await server.createRoom();
    await expect(
      server.open(roomId, { headers: { Origin: 'https://evil.example' } }),
    ).rejects.toEqual(new UpgradeRefused(403));
    const own = await server.open(roomId, { headers: { Origin: server.origin } });
    await own.join('Ada');
    expect(own.playerId).not.toBe('');
  });

  it('refuses an Origin that is not a web address', async () => {
    server = await new TestServer().start();
    const response = await server.request('/rooms', {
      method: 'POST',
      headers: { Origin: 'null' },
    });
    expect(response.status).toBe(403);
  });
});

describe('rooms that do not exist', () => {
  it('completes the upgrade, says ROOM_NOT_FOUND in the protocol and closes', async () => {
    server = await new TestServer().start();
    const client = await server.open('a'.repeat(22));
    expect((await client.next('error')).code).toBe('ROOM_NOT_FOUND');
    expect(await client.closed).toBe(1008);
  });

  it('says the same about a room that has closed', async () => {
    server = await new TestServer().start({ idleRoomMs: 5_000 });
    const roomId = await server.createRoom();
    server.time.advance(5_000);
    const client = await server.open(roomId);
    expect((await client.next('error')).code).toBe('ROOM_NOT_FOUND');
  });

  it.each(['/rooms/short', '/rooms/', '/rooms', '/elsewhere', `/rooms/${'a'.repeat(22)}/extra`])(
    'refuses an upgrade to %s as a plain 404',
    async (path) => {
      server = await new TestServer().start();
      await expect(
        TestClient.connect(`ws://127.0.0.1:${String(server.port)}${path}`),
      ).rejects.toEqual(new UpgradeRefused(404));
    },
  );
});

describe('other requests', () => {
  it('answers 404 for anything that is not a route, and never lists the content folder', async () => {
    server = await new TestServer().start();
    for (const path of [
      '/',
      '/content/quizzes/courses.json',
      '/quizzes/demo-1001/birds-w1-plumage.json',
      '/images/',
      '/images/demo-1001/feather-bands.png',
      '/images/..%2f..%2fquizzes%2fcourses.json',
      '/images/no-such-name',
      `/rooms/${'a'.repeat(22)}`,
    ]) {
      expect((await server.request(path)).status, path).toBe(404);
    }
  });

  it('answers 405 for the wrong method on a route', async () => {
    server = await new TestServer().start();
    expect((await server.request('/rooms')).status).toBe(405);
    expect((await server.request('/images/abcdefghijklmnop', { method: 'POST' })).status).toBe(405);
  });
});
