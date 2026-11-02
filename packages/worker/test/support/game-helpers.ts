import { expect, vi } from 'vitest';
import type { GameSettings } from '@quiz-versus/protocol';
import { say } from './fake-connection.js';
import { roomFixture, settings } from './room-fixture.js';
import type { FixtureOptions, Player, RoomFixture } from './room-fixture.js';

/** Host and one friend in the lobby. */
export function lobby(options: FixtureOptions = {}): {
  fixture: RoomFixture;
  host: Player;
  friend: Player;
} {
  const fixture = roomFixture(options);
  const host = fixture.join('Ada');
  const friend = fixture.join('Bo');
  return { fixture, host, friend };
}

/** The host starts a game and the test waits until the first question reaches the friend. */
export async function startGame(
  host: Player,
  fixture: RoomFixture,
  friend: Player,
  overrides: Partial<GameSettings> = {},
): Promise<void> {
  say(fixture.room, host.connection, { type: 'start', settings: settings(overrides) });
  await vi.waitFor(() => {
    expect(friend.connection.ofType('question').length).toBeGreaterThan(0);
  });
}
