import { describe, expect, it, vi } from 'vitest';
import type { QuizRepository } from '@quiz-versus/core';
import { MAX_PREPARE_ATTEMPTS } from '../config/defaults.js';
import { createDiskQuizRepository } from '../content/disk-quiz-repository.js';
import { fakeContentRoot } from '../../test/support/content-root.js';
import { say } from '../../test/support/fake-connection.js';
import { lobby, startGame } from '../../test/support/game-helpers.js';
import { settings } from '../../test/support/room-fixture.js';

/** A repository that waits for `release()`, then loads for real and says when it has finished. */
function heldRepository(): {
  repository: QuizRepository;
  release: () => void;
  loaded: Promise<void>;
} {
  const disk = createDiskQuizRepository(fakeContentRoot);
  let release: () => void = () => undefined;
  let loadedNow: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const loaded = new Promise<void>((resolve) => {
    loadedNow = resolve;
  });
  const repository: QuizRepository = {
    load: async (quizId) => {
      await held;
      const quiz = await disk.load(quizId);
      loadedNow();
      return quiz;
    },
  };
  return { repository, release, loaded };
}

/** Lets the code that was waiting on a finished load run to the end. */
const afterLoad = async (loaded: Promise<void>): Promise<void> => {
  await loaded;
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('a room that closes while its game is being prepared', () => {
  it('starts nothing and registers no pictures', async () => {
    const { repository, release, loaded } = heldRepository();
    const { fixture, host, friend } = lobby({ repository });
    const register = vi.spyOn(fixture.images, 'register');
    say(fixture.room, host.connection, { type: 'start', settings: settings() });
    say(fixture.room, host.connection, { type: 'leave' });
    say(fixture.room, friend.connection, { type: 'leave' });
    expect(fixture.room.isClosed).toBe(true);
    release();
    await afterLoad(loaded);
    expect(register).not.toHaveBeenCalled();
    expect(fixture.log.lines.filter((line) => line.event === 'room.phase')).toEqual([]);
    expect(fixture.time.pending).toBe(0);
  });
});

describe('a start that core refuses after the game was prepared', () => {
  it('forgets the picture names it registered', async () => {
    const { repository, release, loaded } = heldRepository();
    const { fixture, host } = lobby({ repository });
    const register = vi.spyOn(fixture.images, 'register');
    say(fixture.room, host.connection, { type: 'start', settings: settings({ questionCount: 9 }) });
    say(fixture.room, host.connection, { type: 'leave' });
    release();
    await afterLoad(loaded);
    expect(register).toHaveBeenCalledOnce();
    const aliases = [...(register.mock.calls[0]?.[1].keys() ?? [])];
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.map((alias) => fixture.images.pathFor(alias))).toEqual(
      aliases.map(() => undefined),
    );
    expect(fixture.room.isClosed).toBe(false);
  });
});

describe('picture names that collide with another room', () => {
  it('prepares the game again and starts once a name is free', async () => {
    const { fixture, host, friend } = lobby();
    const collides = vi.spyOn(fixture.images, 'collidesWith');
    collides.mockReturnValueOnce(true).mockReturnValueOnce(true);
    await startGame(host, fixture, friend);
    expect(collides).toHaveBeenCalledTimes(MAX_PREPARE_ATTEMPTS);
    expect(host.connection.errors).toEqual([]);
  });

  it('gives up with INTERNAL_ERROR after the allowed attempts and stays in the lobby', async () => {
    const { fixture, host } = lobby();
    const collides = vi.spyOn(fixture.images, 'collidesWith').mockReturnValue(true);
    say(fixture.room, host.connection, { type: 'start', settings: settings() });
    await vi.waitFor(() => {
      expect(host.connection.errors).toEqual(['INTERNAL_ERROR']);
    });
    expect(collides).toHaveBeenCalledTimes(MAX_PREPARE_ATTEMPTS);
    expect(host.connection.last('room').room.phase).toBe('lobby');
    expect(fixture.log.lines).toContainEqual({
      level: 'error',
      event: 'game.setup_failed',
      fields: { reason: 'PictureNameCollisionError' },
    });
  });
});

describe('a fault inside a room', () => {
  it('closes that room and logs it when a socket closes, without throwing to the caller', () => {
    const { fixture, host, friend } = lobby();
    vi.spyOn(fixture.log, 'info').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => {
      fixture.room.detach(friend.connection);
    }).not.toThrow();
    expect(fixture.room.isClosed).toBe(true);
    expect(fixture.log.lines).toContainEqual({
      level: 'error',
      event: 'room.fault',
      fields: { error: 'Error', entry: 'background' },
    });
    expect(host.connection.closedWith?.code).toBe(1000);
  });

  it('answers INTERNAL_ERROR and keeps the socket when a message handler faults', () => {
    const { fixture, host } = lobby();
    vi.spyOn(fixture.log, 'info').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    say(fixture.room, host.connection, { type: 'next' });
    expect(host.connection.errors).toEqual(['INTERNAL_ERROR']);
    expect(host.connection.closedWith).toBeUndefined();
  });
});
