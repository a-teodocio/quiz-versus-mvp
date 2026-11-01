import { describe, expect, it } from 'vitest';
import { judge } from '../src/room/grade.js';
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
  typedItem,
} from './support/room-driver.js';

const resume = (room: RoomDriver, token: string): ReturnType<RoomDriver['send']> =>
  room.send({
    type: 'join',
    name: 'ignored',
    identity: { playerId: playerIdOf(90), resumeToken: tokenOf(90) },
    resumeToken: token,
  });

describe('resuming in each phase', () => {
  it('sends only welcome and room in the lobby', () => {
    const room = new RoomDriver();
    room.joinMany(2);
    room.send({ type: 'disconnect', playerId: playerIdOf(2) });
    const effects = resume(room, tokenOf(2));
    expect(messages(effects).map((message) => message.type)).toEqual(['welcome', 'room']);
  });

  it('sends the open question with the time left, without a second answerAck', () => {
    const room = new RoomDriver();
    const [host, other] = room.joinMany(2) as [string, string];
    room.start(host, planOf([pickItem('i1')]));
    room.right(other);
    room.send({ type: 'disconnect', playerId: other });
    room.advance(10_000);
    const effects = resume(room, tokenOf(2));
    expect(messages(effects, 'caller').map((message) => message.type)).toEqual([
      'welcome',
      'question',
    ]);
    expect(messagesOfType(effects, 'question')[0]?.durationMs).toBe(20_000);
    expect(messagesOfType(effects, 'answerAck')).toEqual([]);
    const [snapshot] = messagesOfType(effects, 'room');
    expect(snapshot?.room.players.find((player) => player.id === other)?.answered).toBe(true);
  });

  it('lets a resume take over a seat that still shows as connected', () => {
    const room = new RoomDriver();
    room.joinMany(2);
    expect(messagesOfType(resume(room, tokenOf(2)), 'welcome')).toHaveLength(1);
    expect(room.state.seats).toHaveLength(2);
  });
});

describe('joining with an id that is already seated', () => {
  it('refuses it instead of merging the seats', () => {
    const room = new RoomDriver();
    room.join();
    const effects = room.send({
      type: 'join',
      name: 'Copy',
      identity: { playerId: playerIdOf(1), resumeToken: tokenOf(77) },
      resumeToken: undefined,
    });
    expect(errorCodes(effects)).toEqual(['INTERNAL_ERROR']);
    expect(room.state.seats).toHaveLength(1);
  });
});

describe('the host', () => {
  it('lets the new host move on after the old host disconnected at a reveal', () => {
    const room = new RoomDriver();
    const [host, second] = room.joinMany(2) as [string, string];
    room.start(host, planOf([pickItem('i1'), pickItem('i2')]));
    room.right(host);
    room.right(second);
    room.send({ type: 'disconnect', playerId: host });
    expect(errorCodes(room.next(host))).toEqual(['NOT_HOST']);
    room.next(second);
    expect(room.open().open.item.key).toBe('i2');
  });

  it('falls back to the first seat when the host leaves and everyone else is disconnected', () => {
    const room = new RoomDriver();
    const [host, second, third] = room.joinMany(3) as [string, string, string];
    room.send({ type: 'disconnect', playerId: second });
    room.send({ type: 'disconnect', playerId: third });
    room.send({ type: 'leave', playerId: host });
    expect(room.state.hostId).toBe(second);
  });

  it('handles a repeated disconnect without changing anything', () => {
    const room = new RoomDriver();
    const [, other] = room.joinMany(2) as [string, string];
    room.send({ type: 'disconnect', playerId: other });
    const before = room.state;
    room.send({ type: 'disconnect', playerId: other });
    expect(room.state).toEqual(before);
  });
});

describe('leaving in other phases', () => {
  it('removes a player during a reveal that has no tie-break', () => {
    const room = new RoomDriver();
    const [host, second, third] = room.joinMany(3) as [string, string, string];
    room.start(host, planOf([pickItem('i1'), pickItem('i2')]));
    [host, second, third].forEach((id) => room.right(id));
    room.send({ type: 'leave', playerId: third });
    expect(room.state.phase).toBe('reveal');
    expect(snapshotOf(room.state).players).toHaveLength(2);
    room.next(host);
    expect(room.state.phase).toBe('question');
  });

  it('removes a player after the results and leaves the results as they were', () => {
    const room = new RoomDriver();
    const [host, other] = room.joinMany(2) as [string, string];
    room.start(host, planOf([pickItem('i1')]));
    room.right(host);
    room.wrong(other);
    room.next(host);
    room.send({ type: 'leave', playerId: other });
    expect(room.state.phase).toBe('results');
    expect(room.state.phase === 'results' && room.state.results.standings).toHaveLength(2);
  });
});

describe('an emptied room', () => {
  function emptiedDuring(phase: 'question' | 'reveal'): RoomDriver {
    const room = new RoomDriver();
    const [first, second] = room.joinMany(2) as [string, string];
    room.start(first, planOf([pickItem('i1')]));
    if (phase === 'reveal') {
      room.right(first);
      room.right(second);
    }
    expect(room.state.phase).toBe(phase);
    room.send({ type: 'leave', playerId: first });
    room.send({ type: 'leave', playerId: second });
    return room;
  }

  it.each(['question', 'reveal'] as const)(
    'survives a stale alarm after the last player left during a %s',
    (phase) => {
      const room = emptiedDuring(phase);
      room.advance(120_000);
      expect(room.send({ type: 'timerFired' })).toEqual([]);
    },
  );

  it('starts over as an empty lobby if someone joins anyway', () => {
    const room = emptiedDuring('question');
    room.join('Back');
    expect(snapshotOf(room.state)).toMatchObject({ phase: 'lobby', settings: null });
  });
});

describe('judging an answer of the wrong kind', () => {
  it('never marks a pick right for a typed item, or typed text right for a pick item', () => {
    expect(judge(typedItem('i1'), { kind: 'pick', index: 1 })).toEqual({
      correct: false,
      near: false,
    });
    expect(judge(pickItem('i1'), { kind: 'type', text: 'Alpha option' })).toEqual({
      correct: false,
      near: false,
    });
  });
});
