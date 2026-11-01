import { describe, expect, it } from 'vitest';
import {
  decodeServerMessage,
  ERROR_CODES,
  MAX_PLAYERS_PER_ROOM,
  MAX_TIEBREAK_ROUNDS,
} from '../src/index.js';
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
    ['a tied player id that is not an id', { round: 1, playerIds: [HOST_ID, 'x'] }, false],
    ['an extra field', { round: 1, playerIds: [HOST_ID, GUEST_ID], winner: HOST_ID }, false],
  ])('%s', (_label, tiebreak, expected) => {
    expect(roomWith({ tiebreak })).toBe(expected);
  });

  it('is required: a snapshot without the field is refused', () => {
    expect(roomWith({ tiebreak: undefined })).toBe(false);
  });
});

describe('joining after the game has started', () => {
  it('has no "game in progress" error, because late joining is allowed', () => {
    expect(ERROR_CODES).not.toContain('GAME_IN_PROGRESS');
  });

  it('has an error for a game that is already over', () => {
    expect(ERROR_CODES).toContain('GAME_OVER');
  });
});
