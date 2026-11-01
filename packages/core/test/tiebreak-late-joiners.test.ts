import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../src/room/messages.js';
import { RoomDriver, pickItem, planOf, playerIdOf, tokenOf } from './support/room-driver.js';

/**
 * A one-question game with a reserve. Two players start; a third joins while the question is
 * open (a late joiner). `rightAt` lists who answers right, by position (0 and 1 started, 2 joined late).
 */
function lateJoinerGame(rightAt: readonly number[]): { room: RoomDriver; ids: string[] } {
  const room = new RoomDriver();
  const started = room.joinMany(2);
  room.start(started[0] ?? '', planOf([pickItem('i1')], [pickItem('s1')]));
  room.send({
    type: 'join',
    name: 'Late',
    identity: { playerId: playerIdOf(3), resumeToken: tokenOf(3) },
    resumeToken: undefined,
  });
  const ids = [...started, playerIdOf(3)];
  ids.forEach((id, at) => (rightAt.includes(at) ? room.right(id) : room.wrong(id)));
  return { room, ids };
}

describe('a late joiner level at the top (ADR 7)', () => {
  it('leaves the others to play off, and the late joiner shares rank 1 on the equal score', () => {
    const { room, ids } = lateJoinerGame([0, 1, 2]);
    expect(snapshotOf(room.state).tiebreak?.playerIds).toEqual([ids[0], ids[1]]);
  });

  it('plays nothing when only one non-late player is level with the late joiner', () => {
    const { room } = lateJoinerGame([0, 2]);
    expect(snapshotOf(room.state).tiebreak).toBeNull();
  });

  it('plays nothing when the late joiner leads alone', () => {
    const { room } = lateJoinerGame([2]);
    expect(snapshotOf(room.state).tiebreak).toBeNull();
  });
});
