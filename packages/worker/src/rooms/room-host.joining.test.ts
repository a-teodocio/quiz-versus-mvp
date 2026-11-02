import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_PLAYERS_PER_ROOM,
  PROTOCOL_VERSION,
} from '@quiz-versus/protocol';
import { JOIN_TIMEOUT_MS, MAX_CONNECTIONS_PER_ROOM } from '../config/defaults.js';
import { say } from '../../test/support/fake-connection.js';
import { roomFixture } from '../../test/support/room-fixture.js';
import { CLOSE_NORMAL, CLOSE_POLICY, CLOSE_REPLACED } from './connection.js';

const join = { type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Ada' } as const;

describe('joining a room', () => {
  it('welcomes the first player, makes them host, and shows everyone the room', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    expect(ada.connection.received.map((message) => message.type)).toEqual(['welcome', 'room']);
    const room = ada.connection.last('room').room;
    expect(room.hostId).toBe(ada.playerId);
    expect(room.players).toMatchObject([{ name: 'Ada', connected: true }]);
    const bo = fixture.join('Bo');
    expect(ada.connection.last('room').room.players.map((player) => player.name)).toEqual([
      'Ada',
      'Bo',
    ]);
    expect(bo.connection.last('room').room.hostId).toBe(ada.playerId);
  });

  it('refuses a second join on the same socket', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    say(fixture.room, ada.connection, join);
    expect(ada.connection.errors).toEqual(['ALREADY_JOINED']);
    expect(ada.connection.last('room').room.players).toHaveLength(1);
  });

  it('refuses anything but join before joining', () => {
    const fixture = roomFixture();
    const socket = fixture.connect();
    say(fixture.room, socket, { type: 'next' });
    say(fixture.room, socket, { type: 'leave' });
    expect(socket.errors).toEqual(['NOT_JOINED', 'NOT_JOINED']);
  });

  it('answers a message it cannot read with an error and keeps the socket open', () => {
    const fixture = roomFixture();
    const socket = fixture.connect();
    fixture.room.receive(socket, 'not json');
    fixture.room.receive(socket, JSON.stringify({ type: 'join', name: 'Ada', isHost: true }));
    fixture.room.receive(socket, 'x'.repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
    expect(socket.errors).toEqual(['MALFORMED_MESSAGE', 'MALFORMED_MESSAGE', 'MESSAGE_TOO_LARGE']);
    expect(socket.closedWith).toBeUndefined();
  });

  it('refuses a join from another protocol version and closes the socket', () => {
    const fixture = roomFixture();
    const socket = fixture.connect();
    fixture.room.receive(
      socket,
      JSON.stringify({ ...join, protocolVersion: PROTOCOL_VERSION + 1 }),
    );
    expect(socket.errors).toEqual(['UNSUPPORTED_VERSION']);
    expect(socket.closedWith?.code).toBe(CLOSE_POLICY);
  });

  it('refuses the player after a full room, and never gives a client its own id or role', () => {
    const fixture = roomFixture();
    for (let at = 0; at < MAX_PLAYERS_PER_ROOM; at += 1) fixture.join(`Player ${String(at)}`);
    const late = fixture.connect();
    say(fixture.room, late, join);
    expect(late.errors).toEqual(['ROOM_FULL']);
    expect(late.ofType('welcome')).toEqual([]);
  });
});

describe('sockets that do not behave', () => {
  it('closes a socket that has not joined in time', () => {
    const fixture = roomFixture();
    const socket = fixture.connect();
    fixture.time.advance(JOIN_TIMEOUT_MS);
    expect(socket.errors).toEqual(['NOT_JOINED']);
    expect(socket.closedWith?.code).toBe(CLOSE_POLICY);
  });

  it('leaves a socket that joined in time alone', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    fixture.time.advance(JOIN_TIMEOUT_MS * 2);
    expect(ada.connection.closedWith).toBeUndefined();
  });

  it('accepts only so many sockets for one room', () => {
    const fixture = roomFixture();
    for (let at = 0; at < MAX_CONNECTIONS_PER_ROOM; at += 1) fixture.connect();
    const extra = fixture.connect();
    expect(extra.errors).toEqual(['ROOM_FULL']);
    expect(extra.closedWith?.code).toBe(CLOSE_POLICY);
  });
});

describe('dropping and coming back', () => {
  it('keeps the seat of a dropped player, shown as not connected', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    const bo = fixture.join('Bo');
    fixture.room.detach(bo.connection);
    const players = ada.connection.last('room').room.players;
    expect(players.find((player) => player.id === bo.playerId)?.connected).toBe(false);
  });

  it('gives a returning player the same seat with their token', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    const bo = fixture.join('Bo');
    fixture.room.detach(bo.connection);
    const back = fixture.connect();
    say(fixture.room, back, { ...join, name: 'Bo', resumeToken: bo.resumeToken });
    expect(back.last('welcome').playerId).toBe(bo.playerId);
    const players = ada.connection.last('room').room.players;
    expect(players.map((player) => player.connected)).toEqual([true, true]);
  });

  it('closes the older socket when a newer one takes the seat, and ignores its later close', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    const bo = fixture.join('Bo');
    const second = fixture.connect();
    say(fixture.room, second, { ...join, name: 'Bo', resumeToken: bo.resumeToken });
    expect(bo.connection.closedWith?.code).toBe(CLOSE_REPLACED);
    fixture.room.detach(bo.connection);
    const players = ada.connection.last('room').room.players;
    expect(players.find((player) => player.id === bo.playerId)?.connected).toBe(true);
    second.clear();
    fixture.room.detach(second);
    expect(ada.connection.last('room').room.players.map((player) => player.connected)).toEqual([
      true,
      false,
    ]);
  });

  it('refuses a token that matches no seat', () => {
    const fixture = roomFixture();
    fixture.join('Ada');
    const socket = fixture.connect();
    say(fixture.room, socket, { ...join, resumeToken: 'a'.repeat(22) });
    expect(socket.errors).toEqual(['INVALID_RESUME_TOKEN']);
  });
});

describe('leaving and closing', () => {
  it('removes a player who leaves, closes their socket and passes the host role on', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    const bo = fixture.join('Bo');
    say(fixture.room, ada.connection, { type: 'leave' });
    expect(ada.connection.closedWith?.code).toBe(CLOSE_NORMAL);
    const room = bo.connection.last('room').room;
    expect(room.players.map((player) => player.name)).toEqual(['Bo']);
    expect(room.hostId).toBe(bo.playerId);
    fixture.room.detach(ada.connection);
    expect(bo.connection.last('room').room.players).toHaveLength(1);
  });

  it('closes the room when the last player leaves, and forgets its timers', () => {
    const fixture = roomFixture();
    const ada = fixture.join('Ada');
    say(fixture.room, ada.connection, { type: 'leave' });
    expect(fixture.room.isClosed).toBe(true);
    expect(fixture.closedRooms).toEqual([fixture.room.roomId]);
    expect(fixture.time.pending).toBe(0);
  });

  it('closes a room nobody ever joined, once the idle limit passes', () => {
    const fixture = roomFixture({ idleRoomMs: 5_000 });
    fixture.time.advance(4_999);
    expect(fixture.room.isClosed).toBe(false);
    fixture.time.advance(1);
    expect(fixture.room.isClosed).toBe(true);
    expect(fixture.time.pending).toBe(0);
  });

  it('closes a room that everyone dropped from, unless someone comes back first', () => {
    const fixture = roomFixture({ idleRoomMs: 5_000 });
    const ada = fixture.join('Ada');
    fixture.room.detach(ada.connection);
    fixture.time.advance(4_000);
    const back = fixture.connect();
    say(fixture.room, back, { ...join, resumeToken: ada.resumeToken });
    fixture.time.advance(60_000);
    expect(fixture.room.isClosed).toBe(false);
    fixture.room.detach(back);
    fixture.time.advance(5_000);
    expect(fixture.room.isClosed).toBe(true);
    expect(fixture.time.pending).toBe(0);
  });

  it('closes every socket when the room closes', () => {
    const fixture = roomFixture({ idleRoomMs: 5_000 });
    const waiting = fixture.connect();
    fixture.time.advance(5_000);
    expect(waiting.closedWith?.code).toBe(CLOSE_NORMAL);
  });
});
