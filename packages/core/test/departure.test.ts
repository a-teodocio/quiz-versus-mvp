import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../src/room/messages.js';
import { RoomDriver, messagesOfType, pickItem, planOf } from './support/room-driver.js';

describe('disconnecting', () => {
  it('shows the player as not connected and tells everyone', () => {
    const room = new RoomDriver();
    const [, other] = room.joinMany(2) as [string, string];
    const effects = room.send({ type: 'disconnect', playerId: other });
    const [message] = messagesOfType(effects, 'room');
    expect(message?.room.players.map((player) => player.connected)).toEqual([true, false]);
  });

  it('passes the host role to the earliest connected player', () => {
    const room = new RoomDriver();
    const [host, second, third] = room.joinMany(3) as [string, string, string];
    room.send({ type: 'disconnect', playerId: host });
    expect(snapshotOf(room.state).hostId).toBe(second);
    room.send({ type: 'disconnect', playerId: second });
    expect(snapshotOf(room.state).hostId).toBe(third);
  });

  it('keeps the host when nobody is connected, so the room is not left without one', () => {
    const room = new RoomDriver();
    const [host, second] = room.joinMany(2) as [string, string];
    room.send({ type: 'disconnect', playerId: second });
    room.send({ type: 'disconnect', playerId: host });
    expect(room.state.hostId).toBe(host);
  });

  it('ignores a disconnect from someone who is not in the room', () => {
    const room = new RoomDriver();
    room.join();
    expect(room.send({ type: 'disconnect', playerId: 'nobody-00000000000' })).toEqual([]);
  });
});

describe('leaving', () => {
  it('removes the seat, and the next player becomes host if the host left', () => {
    const room = new RoomDriver();
    const [host, other] = room.joinMany(2) as [string, string];
    room.send({ type: 'leave', playerId: host });
    expect(snapshotOf(room.state)).toMatchObject({ hostId: other });
    expect(room.state.seats).toHaveLength(1);
  });

  it('closes the room when the last player leaves', () => {
    const room = new RoomDriver();
    const [only] = room.joinMany(1) as [string];
    const effects = room.send({ type: 'leave', playerId: only });
    expect(effects).toContainEqual({ type: 'closeRoom' });
    expect(room.state.seats).toHaveLength(0);
  });

  it('closes the open question when the player who had not answered leaves', () => {
    const room = new RoomDriver();
    const [host, second, third] = room.joinMany(3) as [string, string, string];
    room.start(host, planOf([pickItem('i1')]));
    room.right(host);
    room.right(second);
    expect(room.state.phase).toBe('question');
    room.send({ type: 'leave', playerId: third });
    expect(room.state.phase).toBe('reveal');
  });

  it('drops the leaver from the reveal, which lists only players still there', () => {
    const room = new RoomDriver();
    const [host, second, third] = room.joinMany(3) as [string, string, string];
    room.start(host, planOf([pickItem('i1')]));
    room.right(third);
    room.send({ type: 'leave', playerId: third });
    room.right(host);
    const reveal = room.right(second);
    const [message] = messagesOfType(reveal, 'reveal');
    expect(message?.results.map((result) => result.playerId)).toEqual([host, second]);
  });

  it('ignores a leave from someone who is not in the room', () => {
    const room = new RoomDriver();
    room.join();
    expect(room.send({ type: 'leave', playerId: 'nobody-00000000000' })).toEqual([]);
  });
});
