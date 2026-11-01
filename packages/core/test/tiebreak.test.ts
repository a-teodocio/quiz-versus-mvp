import { MAX_TIEBREAK_ROUNDS } from '@quiz-versus/protocol';
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

const spareItems = (count: number) =>
  Array.from({ length: count }, (_, at) => pickItem(`s${String(at + 1)}`, at % 4));

/** A one-question game. `answers` says who answers it right; everyone else answers wrong. */
function gameAfterRegular(
  players: number,
  rightAt: readonly number[],
  spare = 5,
): { room: RoomDriver; ids: string[]; host: string } {
  const room = new RoomDriver();
  const ids = room.joinMany(players);
  const host = ids[0] ?? '';
  room.start(host, planOf([pickItem('i1')], spareItems(spare)));
  ids.forEach((id, at) => (rightAt.includes(at) ? room.right(id) : room.wrong(id)));
  return { room, ids, host };
}

const tiebreakOf = (room: RoomDriver) => snapshotOf(room.state).tiebreak;
const resultsOf = (room: RoomDriver) =>
  room.state.phase === 'results' ? room.state.results : null;

describe('announcing a tie', () => {
  it('announces a tie for first place at the last regular reveal', () => {
    const { room, ids } = gameAfterRegular(3, [0, 1]);
    expect(room.state.phase).toBe('reveal');
    expect(tiebreakOf(room)).toEqual({ round: 1, playerIds: [ids[0], ids[1]] });
  });

  it('plays nothing when one player leads', () => {
    const { room, host } = gameAfterRegular(3, [0]);
    expect(tiebreakOf(room)).toBeNull();
    room.next(host);
    expect(room.state.phase).toBe('results');
  });

  it('does not play off a tie below first place (ADR 6)', () => {
    const room = new RoomDriver();
    const ids = room.joinMany(3);
    const host = ids[0] ?? '';
    room.start(host, planOf([pickItem('i1'), pickItem('i2')], spareItems(5)));
    room.right(ids[0] ?? '');
    room.wrong(ids[1] ?? '');
    room.wrong(ids[2] ?? '');
    room.next(host);
    room.right(ids[0] ?? '');
    room.right(ids[1] ?? '');
    room.right(ids[2] ?? '');
    expect(tiebreakOf(room)).toBeNull();
    room.next(host);
    expect(resultsOf(room)?.standings.map((row) => row.rank)).toEqual([1, 2, 2]);
  });

  it('shares rank 1 when there is no spare question', () => {
    const { room, host } = gameAfterRegular(2, [0, 1], 0);
    expect(tiebreakOf(room)).toBeNull();
    room.next(host);
    expect(resultsOf(room)?.standings.map((row) => row.rank)).toEqual([1, 1]);
  });

  it('changes the snapshot only at a reveal, so it cannot leak who answered correctly', () => {
    const room = new RoomDriver();
    const ids = room.joinMany(2);
    room.start(ids[0] ?? '', planOf([pickItem('i1')], spareItems(5)));
    room.right(ids[0] ?? '');
    expect(tiebreakOf(room)).toBeNull();
    room.right(ids[1] ?? '');
    expect(tiebreakOf(room)).not.toBeNull();
  });
});

describe('playing a tie-break', () => {
  it('asks a spare question as a tie-break, to everyone, and counts it as round 1', () => {
    const { room, host } = gameAfterRegular(3, [0, 1]);
    const effects = room.next(host);
    const [question] = messagesOfType(effects, 'question');
    expect(question).toMatchObject({ itemKey: 's1', progress: { kind: 'tiebreak', round: 1 } });
    expect(messagesOfType(effects, 'question')).toHaveLength(1);
    expect(messages(effects, 'everyone').some((message) => message.type === 'question')).toBe(true);
    expect(tiebreakOf(room)?.round).toBe(1);
  });

  it('refuses a watcher with NOT_IN_TIEBREAK and does not wait for them', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1]);
    room.next(host);
    expect(errorCodes(room.right(ids[2] ?? ''))).toEqual(['NOT_IN_TIEBREAK']);
    room.right(ids[0] ?? '');
    room.right(ids[1] ?? '');
    expect(room.state.phase).toBe('reveal');
  });

  it('lists only the tied players in the tie-break reveal', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1]);
    room.next(host);
    room.right(ids[0] ?? '');
    const effects = room.wrong(ids[1] ?? '');
    const [reveal] = messagesOfType(effects, 'reveal');
    expect(reveal?.results.map((result) => result.playerId)).toEqual([ids[0], ids[1]]);
  });

  it('ends when one player leads and counts the tie-break in the totals', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1]);
    room.next(host);
    room.right(ids[0] ?? '');
    room.wrong(ids[1] ?? '');
    expect(tiebreakOf(room)).toBeNull();
    room.next(host);
    expect(resultsOf(room)?.standings[0]).toMatchObject({
      playerId: ids[0],
      rank: 1,
      score: 2,
      correctCount: 2,
    });
  });
});

describe('how the tie-break narrows and ends', () => {
  it('keeps the players who are still level and moves on to round 2', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1]);
    room.next(host);
    room.wrong(ids[0] ?? '');
    room.wrong(ids[1] ?? '');
    expect(tiebreakOf(room)).toEqual({ round: 2, playerIds: [ids[0], ids[1]] });
    const effects = room.next(host);
    expect(messagesOfType(effects, 'question')[0]).toMatchObject({
      itemKey: 's2',
      progress: { kind: 'tiebreak', round: 2 },
    });
  });

  it('narrows to the players who stay level at the top', () => {
    const { room, ids, host } = gameAfterRegular(4, [0, 1, 2]);
    room.next(host);
    room.right(ids[0] ?? '');
    room.right(ids[1] ?? '');
    room.wrong(ids[2] ?? '');
    expect(tiebreakOf(room)).toEqual({ round: 2, playerIds: [ids[0], ids[1]] });
  });

  it(`stops after ${String(MAX_TIEBREAK_ROUNDS)} rounds and shares rank 1`, () => {
    const { room, ids, host } = gameAfterRegular(2, [0, 1]);
    for (let round = 1; round <= MAX_TIEBREAK_ROUNDS; round++) {
      room.next(host);
      room.right(ids[0] ?? '');
      room.right(ids[1] ?? '');
    }
    expect(tiebreakOf(room)).toBeNull();
    room.next(host);
    expect(resultsOf(room)?.standings.map((row) => [row.rank, row.score])).toEqual([
      [1, 1 + MAX_TIEBREAK_ROUNDS],
      [1, 1 + MAX_TIEBREAK_ROUNDS],
    ]);
  });

  it('stops when the spare questions run out', () => {
    const { room, ids, host } = gameAfterRegular(2, [0, 1], 2);
    for (let round = 1; round <= 2; round++) {
      room.next(host);
      room.right(ids[0] ?? '');
      room.right(ids[1] ?? '');
    }
    expect(tiebreakOf(room)).toBeNull();
    room.next(host);
    expect(room.state.phase).toBe('results');
  });
});

describe('people coming and going during a tie-break', () => {
  it('never puts a late joiner in the tie-break', () => {
    const room = new RoomDriver();
    const ids = room.joinMany(2);
    room.start(ids[0] ?? '', planOf([pickItem('i1')], spareItems(5)));
    room.send({
      type: 'join',
      name: 'Late',
      identity: { playerId: playerIdOf(3), resumeToken: tokenOf(3) },
      resumeToken: undefined,
    });
    ids.forEach((id) => room.wrong(id));
    room.wrong(playerIdOf(3));
    expect(tiebreakOf(room)?.playerIds).toEqual(ids);
  });

  it('gives a player who joins during a tie-break question the question to watch', () => {
    const { room, host } = gameAfterRegular(2, [0, 1]);
    room.next(host);
    const effects = room.send({
      type: 'join',
      name: 'Late',
      identity: { playerId: playerIdOf(3), resumeToken: tokenOf(3) },
      resumeToken: undefined,
    });
    expect(messagesOfType(effects, 'question')).toHaveLength(1);
    expect(errorCodes(room.right(playerIdOf(3)))).toEqual(['NOT_IN_TIEBREAK']);
  });
});

describe('tied players who drop out', () => {
  it('keeps a disconnected tied player in the tie-break and does not wait for them', () => {
    const { room, ids, host } = gameAfterRegular(2, [0, 1]);
    room.next(host);
    room.send({ type: 'disconnect', playerId: ids[1] ?? '' });
    expect(tiebreakOf(room)?.playerIds).toContain(ids[1]);
    room.right(ids[0] ?? '');
    expect(room.state.phase).toBe('reveal');
  });

  it('waits for the timeout when every tied player has dropped, so rounds cannot run out', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1]);
    room.next(host);
    room.send({ type: 'disconnect', playerId: ids[0] ?? '' });
    room.send({ type: 'disconnect', playerId: ids[1] ?? '' });
    expect(room.state.phase).toBe('question');
    room.timeout();
    expect(room.state.phase).toBe('reveal');
    expect(tiebreakOf(room)?.round).toBe(2);
  });

  it('goes to the results when a tied player leaves and fewer than two remain', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1]);
    room.next(host);
    const effects = room.send({ type: 'leave', playerId: ids[1] ?? '' });
    expect(room.state.phase).toBe('results');
    expect(effects).toContainEqual({ type: 'clearTimer' });
    expect(messagesOfType(effects, 'results')).toHaveLength(1);
    expect(tiebreakOf(room)).toBeNull();
  });

  it('drops the announced tie-break when a tied player leaves during the reveal', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1]);
    room.send({ type: 'leave', playerId: ids[1] ?? '' });
    expect(tiebreakOf(room)).toBeNull();
    room.next(host);
    expect(room.state.phase).toBe('results');
  });

  it('narrows the tie-break but carries on when three were tied and one leaves', () => {
    const { room, ids, host } = gameAfterRegular(3, [0, 1, 2]);
    expect(tiebreakOf(room)?.playerIds).toEqual(ids);
    room.next(host);
    room.send({ type: 'leave', playerId: ids[2] ?? '' });
    expect(room.state.phase).toBe('question');
    expect(tiebreakOf(room)?.playerIds).toEqual([ids[0], ids[1]]);
  });
});
