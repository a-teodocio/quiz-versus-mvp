import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_MESSAGES_PER_WINDOW,
  MESSAGE_RATE_WINDOW_MS,
} from '@quiz-versus/protocol';
import { MAX_CLIENT_FRAME_BYTES } from '../src/config/defaults.js';
import { TestServer } from './support/test-server.js';

let server: TestServer;

afterEach(async () => {
  await server.stop();
});

describe('message size', () => {
  it('answers a message a little over the limit with MESSAGE_TOO_LARGE and stays open', async () => {
    server = await new TestServer().start();
    const client = await server.open(await server.createRoom());
    client.sendText('x'.repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
    expect((await client.next('error')).code).toBe('MESSAGE_TOO_LARGE');
    await client.join('Ada');
    expect(client.playerId).not.toBe('');
  });

  it('closes the connection for a frame above the frame cap', async () => {
    server = await new TestServer().start();
    const client = await server.open(await server.createRoom());
    client.sendText('x'.repeat(MAX_CLIENT_FRAME_BYTES + 1));
    expect(await client.closed).toBe(1009);
  });

  it('accepts a message exactly at the limit as far as size goes', async () => {
    server = await new TestServer().start();
    const client = await server.open(await server.createRoom());
    client.sendText(' '.repeat(MAX_CLIENT_MESSAGE_BYTES));
    expect((await client.next('error')).code).toBe('MALFORMED_MESSAGE');
  });
});

describe('what a socket may send', () => {
  it('refuses a binary frame and keeps the connection', async () => {
    server = await new TestServer().start();
    const client = await server.open(await server.createRoom());
    client.sendBinary(new Uint8Array([1, 2, 3]));
    const error = await client.next('error');
    expect(error.code).toBe('MALFORMED_MESSAGE');
    await client.join('Ada');
  });

  it('refuses text that is not a message, and a client claiming to be host', async () => {
    server = await new TestServer().start();
    const client = await server.open(await server.createRoom());
    client.sendText('hello');
    client.sendText(
      JSON.stringify({ type: 'join', protocolVersion: 3, name: 'Ada', isHost: true }),
    );
    expect((await client.next('error')).code).toBe('MALFORMED_MESSAGE');
    expect((await client.next('error')).code).toBe('MALFORMED_MESSAGE');
  });

  it('closes a socket that never joins', async () => {
    server = await new TestServer().start();
    const client = await server.open(await server.createRoom());
    server.time.advance(10_000);
    expect((await client.next('error')).code).toBe('NOT_JOINED');
    expect(await client.closed).toBe(1008);
  });
});

describe('message rate', () => {
  it('tells a fast sender off, then closes the connection if it keeps going', async () => {
    server = await new TestServer().start();
    const client = await server.open(await server.createRoom());
    for (let sent = 0; sent < MAX_MESSAGES_PER_WINDOW * 2 + 1; sent += 1) client.sendText('{}');
    expect(await client.closed).toBe(1008);
    const codes: string[] = [];
    for (let at = 0; at < MAX_MESSAGES_PER_WINDOW * 2; at += 1) {
      codes.push((await client.next('error')).code);
    }
    expect(
      codes.slice(0, MAX_MESSAGES_PER_WINDOW).every((code) => code === 'MALFORMED_MESSAGE'),
    ).toBe(true);
    expect(codes.slice(MAX_MESSAGES_PER_WINDOW).every((code) => code === 'RATE_LIMITED')).toBe(
      true,
    );
  });

  it('starts counting again in the next window', async () => {
    server = await new TestServer().start();
    const client = await server.join(await server.createRoom(), 'Ada');
    for (let sent = 1; sent < MAX_MESSAGES_PER_WINDOW; sent += 1) client.sendText('{}');
    for (let at = 1; at < MAX_MESSAGES_PER_WINDOW; at += 1) await client.next('error');
    client.sendText('{}');
    expect((await client.next('error')).code).toBe('RATE_LIMITED');
    server.time.advance(MESSAGE_RATE_WINDOW_MS);
    client.sendText('{}');
    expect((await client.next('error')).code).toBe('MALFORMED_MESSAGE');
  });
});

describe('dead connections', () => {
  it('drops a connection that stops answering pings, so its room sees a disconnect', async () => {
    server = await new TestServer().start({ heartbeatMs: 1_000 });
    const roomId = await server.createRoom();
    const watcher = await server.join(roomId, 'Ada');
    const silent = await server.join(roomId, 'Bo', { autoPong: false });
    await server.beat(1_000, [watcher]);
    await server.beat(1_000, [watcher]);
    expect(await silent.closed).toBeDefined();
    const room = await watcher.nextRoom((snapshot) => snapshot.players.some((p) => !p.connected));
    expect(room.players.map((player) => player.connected)).toEqual([true, false]);
  });

  it('keeps a connection that answers pings', async () => {
    server = await new TestServer().start({ heartbeatMs: 1_000 });
    const client = await server.join(await server.createRoom(), 'Ada');
    for (let beat = 0; beat < 5; beat += 1) await server.beat(1_000, [client]);
    client.send({ type: 'leave' });
    expect(await client.closed).toBe(1000);
  });
});
