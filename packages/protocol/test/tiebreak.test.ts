import { describe, expect, it } from 'vitest';
import { decodeServerMessage, MAX_PLAYERS_PER_ROOM, MAX_TIEBREAK_ROUNDS } from '../src/index.js';
import { GUEST_ID, HOST_ID, SERVER_SAMPLES } from './samples.js';

const withTiebreak = SERVER_SAMPLES.find(
  (message) => message.type === 'room' && message.room.tiebreak !== null,
);

const roomWith = (override: Record<string, unknown>): boolean => {
  if (withTiebreak?.type !== 'room') throw new Error('missing tie-break room sample');
  const room = { ...withTiebreak.room, ...override };
  return decodeServerMessage(JSON.stringify({ type: 'room', room })).ok;
};

const idList = (count: number): string[] =>
  Array.from({ length: count }, (_, n) => `player_${String(n).padStart(2, '0')}_AAAAAAAAAAAAAAA`);

describe('tie-break in the room snapshot', () => {
  it.each<[string, unknown, boolean]>([
    ['the sample', { round: 1, playerIds: [HOST_ID, GUEST_ID] }, true],
    ['null, when no tie-break is under way', null, true],
    ['the last round', { round: MAX_TIEBREAK_ROUNDS, playerIds: [HOST_ID, GUEST_ID] }, true],
    [
      'a round past the limit',
      { round: MAX_TIEBREAK_ROUNDS + 1, playerIds: [HOST_ID, GUEST_ID] },
      false,
    ],
    ['round zero', { round: 0, playerIds: [HOST_ID, GUEST_ID] }, false],
    ['one tied player, which is a winner and not a tie', { round: 1, playerIds: [HOST_ID] }, false],
    ['no tied players', { round: 1, playerIds: [] }, false],
    ['every seat tied', { round: 1, playerIds: idList(MAX_PLAYERS_PER_ROOM) }, true],
    [
      'more tied players than seats',
      { round: 1, playerIds: idList(MAX_PLAYERS_PER_ROOM + 1) },
      false,
    ],
    ['the same player twice', { round: 1, playerIds: [HOST_ID, HOST_ID] }, false],
    ['a tied player id that is not an id', { round: 1, playerIds: [HOST_ID, 'x'] }, false],
    ['an extra field', { round: 1, playerIds: [HOST_ID, GUEST_ID], winner: HOST_ID }, false],
  ])('%s', (_label, tiebreak, expected) => {
    expect(roomWith({ tiebreak })).toBe(expected);
  });

  it('is required: a snapshot without the field is refused', () => {
    expect(roomWith({ tiebreak: undefined })).toBe(false);
  });
});

describe('late-joining and tie-break error codes', () => {
  const errorMessage = (code: string): boolean =>
    decodeServerMessage(JSON.stringify({ type: 'error', code, message: 'Not allowed.' })).ok;

  it.each(['GAME_OVER', 'NOT_IN_TIEBREAK'])('the server can send %s', (code) => {
    expect(errorMessage(code)).toBe(true);
  });

  it('GAME_IN_PROGRESS no longer exists, because late joining is allowed', () => {
    expect(errorMessage('GAME_IN_PROGRESS')).toBe(false);
  });
});
