import { MAX_PLAYERS_PER_ROOM, PROTOCOL_VERSION } from '@quiz-versus/protocol';
import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../src/room/messages.js';
import {
  RoomDriver,
  errorCodes,
  messages,
  messagesOfType,
  pickItem,
  planOf,
  playerIdOf,
  tokenOf,
} from './support/room-driver.js';

const twoQuestions = planOf([pickItem('i1'), pickItem('i2')]);

describe('joining the lobby', () => {
  it('makes the first player the host and sends welcome, then room', () => {
    const room = new RoomDriver();
    const effects = room.send({
      type: 'join',
      name: 'Ada',
      identity: { playerId: playerIdOf(1), resumeToken: tokenOf(1) },
      resumeToken: undefined,
    });
    expect(messages(effects).map((message) => message.type)).toEqual(['welcome', 'room']);
    const [welcome] = messagesOfType(effects, 'welcome');
    expect(welcome).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      playerId: playerIdOf(1),
      resumeToken: tokenOf(1),
    });
    expect(snapshotOf(room.state)).toMatchObject({ hostId: playerIdOf(1), phase: 'lobby' });
  });

  it('sends welcome only to the caller, and the room to everyone', () => {
    const room = new RoomDriver();
    room.join();
    const effects = room.send({
      type: 'join',
      name: 'Bo',
      identity: { playerId: playerIdOf(2), resumeToken: tokenOf(2) },
      resumeToken: undefined,
    });
    expect(messages(effects, 'caller').map((message) => message.type)).toEqual(['welcome']);
    expect(messages(effects, 'everyone').map((message) => message.type)).toEqual(['room']);
  });

  it('never puts a resume token in a snapshot', () => {
    const room = new RoomDriver();
    room.joinMany(3);
    expect(JSON.stringify(snapshotOf(room.state))).not.toContain('token-');
  });

  it('refuses a ninth player with ROOM_FULL', () => {
    const room = new RoomDriver();
    room.joinMany(MAX_PLAYERS_PER_ROOM);
    const effects = room.send({
      type: 'join',
      name: 'Extra',
      identity: { playerId: playerIdOf(99), resumeToken: tokenOf(99) },
      resumeToken: undefined,
    });
    expect(errorCodes(effects)).toEqual(['ROOM_FULL']);
    expect(room.state.seats).toHaveLength(MAX_PLAYERS_PER_ROOM);
  });
});

describe('resuming a seat', () => {
  it('takes a dropped seat back with the token, keeping id and score', () => {
    const room = new RoomDriver();
    const [host, other] = room.joinMany(2) as [string, string];
    room.start(host, twoQuestions);
    room.right(other);
    room.right(host);
    room.send({ type: 'disconnect', playerId: other });
    expect(room.state.seats.find((seat) => seat.id === other)?.connected).toBe(false);

    const effects = room.send({
      type: 'join',
      name: 'ignored',
      identity: { playerId: playerIdOf(50), resumeToken: tokenOf(50) },
      resumeToken: tokenOf(2),
    });
    expect(messagesOfType(effects, 'welcome')[0]).toMatchObject({ playerId: other });
    expect(room.state.seats).toHaveLength(2);
    expect(room.score(other)).toBe(1);
    expect(room.state.seats.find((seat) => seat.id === other)?.connected).toBe(true);
  });

  it('refuses an unknown token with INVALID_RESUME_TOKEN', () => {
    const room = new RoomDriver();
    room.join();
    const effects = room.send({
      type: 'join',
      name: 'X',
      identity: { playerId: playerIdOf(9), resumeToken: tokenOf(9) },
      resumeToken: tokenOf(77),
    });
    expect(errorCodes(effects)).toEqual(['INVALID_RESUME_TOKEN']);
  });

  it('does not make a returning host take the role back from the player who took it over', () => {
    const room = new RoomDriver();
    const [host, other] = room.joinMany(2) as [string, string];
    room.send({ type: 'disconnect', playerId: host });
    expect(snapshotOf(room.state).hostId).toBe(other);
    room.send({
      type: 'join',
      name: 'x',
      identity: { playerId: playerIdOf(9), resumeToken: tokenOf(9) },
      resumeToken: tokenOf(1),
    });
    expect(snapshotOf(room.state).hostId).toBe(other);
  });
});

function startedRoom(): { room: RoomDriver; host: string; other: string } {
  const room = new RoomDriver();
  const [host, other] = room.joinMany(2) as [string, string];
  room.start(host, twoQuestions);
  return { room, host, other };
}

const lateJoin = (room: RoomDriver, n: number): readonly ReturnType<RoomDriver['send']>[number][] =>
  room.send({
    type: 'join',
    name: 'Late',
    identity: { playerId: playerIdOf(n), resumeToken: tokenOf(n) },
    resumeToken: undefined,
  });

describe('arriving after the game started (ADR 6)', () => {
  it('sends a late joiner the open question with the time left', () => {
    const { room } = startedRoom();
    room.advance(12_000);
    const effects = lateJoin(room, 3);
    expect(messages(effects, 'caller').map((message) => message.type)).toEqual([
      'welcome',
      'question',
    ]);
    expect(messagesOfType(effects, 'question')[0]?.durationMs).toBe(18_000);
    expect(room.score(playerIdOf(3))).toBe(0);
  });

  it('never sends less than 1 ms, even when the alarm is overdue', () => {
    const { room } = startedRoom();
    room.advance(60_000);
    expect(messagesOfType(lateJoin(room, 3), 'question')[0]?.durationMs).toBe(1);
  });

  it('makes the late joiner count toward "everyone has answered"', () => {
    const { room, host, other } = startedRoom();
    lateJoin(room, 3);
    room.right(host);
    room.right(other);
    expect(room.state.phase).toBe('question');
    room.right(playerIdOf(3));
    expect(room.state.phase).toBe('reveal');
  });
});

describe('arriving during a reveal or after the results', () => {
  it('sends a joiner during a reveal the last reveal and waits for the next question', () => {
    const { room, host, other } = startedRoom();
    room.right(host);
    room.right(other);
    const effects = lateJoin(room, 3);
    expect(messages(effects, 'caller').map((message) => message.type)).toEqual([
      'welcome',
      'reveal',
    ]);
  });

  it('refuses a new player after the results with GAME_OVER, but restores a returning one', () => {
    const { room, host, other } = startedRoom();
    for (let round = 0; round < 2; round++) {
      room.right(host);
      room.wrong(other);
      room.next(host);
    }
    expect(room.state.phase).toBe('results');
    expect(errorCodes(lateJoin(room, 3))).toEqual(['GAME_OVER']);

    room.send({ type: 'disconnect', playerId: other });
    const resumed = room.send({
      type: 'join',
      name: 'x',
      identity: { playerId: playerIdOf(9), resumeToken: tokenOf(9) },
      resumeToken: tokenOf(2),
    });
    expect(messages(resumed, 'caller').map((message) => message.type)).toEqual([
      'welcome',
      'results',
    ]);
  });
});
