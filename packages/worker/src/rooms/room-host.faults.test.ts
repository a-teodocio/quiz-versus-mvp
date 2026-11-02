import { describe, expect, it, vi } from 'vitest';
import type { QuizRepository } from '@quiz-versus/core';
import { MAX_PREPARE_ATTEMPTS } from '../config/defaults.js';
import { createDiskQuizRepository } from '../content/disk-quiz-repository.js';
import { fakeContentRoot } from '../../test/support/content-root.js';
import { say } from '../../test/support/fake-connection.js';
import { lobby, startGame } from '../../test/support/game-helpers.js';
import { settings } from '../../test/support/room-fixture.js';

describe('a room that closes while its game is being prepared', () => {
  it('starts nothing and registers no pictures', async () => {
    const disk = createDiskQuizRepository(fakeContentRoot);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: QuizRepository = {
      load: async (quizId) => {
        await held;
        return disk.load(quizId);
      },
    };
    const { fixture, host, friend } = lobby({ repository: slow });
    const register = vi.spyOn(fixture.images, 'register');
    say(fixture.room, host.connection, { type: 'start', settings: settings() });
    say(fixture.room, host.connection, { type: 'leave' });
    say(fixture.room, friend.connection, { type: 'leave' });
    expect(fixture.room.isClosed).toBe(true);
    release();
    await vi.waitFor(() => {
      expect(fixture.log.lines.some((line) => line.event === 'room.closed')).toBe(true);
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(register).not.toHaveBeenCalled();
    expect(fixture.log.lines.filter((line) => line.event === 'room.phase')).toEqual([]);
    expect(fixture.time.pending).toBe(0);
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
