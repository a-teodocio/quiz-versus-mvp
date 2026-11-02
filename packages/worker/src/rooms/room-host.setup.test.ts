import { describe, expect, it, vi } from 'vitest';
import type { QuizRepository } from '@quiz-versus/core';
import { ContentError } from '../content/content-error.js';
import { say } from '../../test/support/fake-connection.js';
import { lobby, startGame } from '../../test/support/game-helpers.js';
import { roomFixture, settings } from '../../test/support/room-fixture.js';

describe('starting a game', () => {
  it('refuses a player who is not the host before reading any quiz file', () => {
    const { fixture, friend } = lobby();
    say(fixture.room, friend.connection, { type: 'start', settings: settings() });
    expect(friend.connection.errors).toEqual(['NOT_HOST']);
    expect(fixture.loads.count).toBe(0);
  });

  it('refuses a host who is alone before reading any quiz file', () => {
    const fixture = roomFixture();
    const host = fixture.join('Ada');
    say(fixture.room, host.connection, { type: 'start', settings: settings() });
    expect(host.connection.errors).toEqual(['NOT_ENOUGH_PLAYERS']);
    expect(fixture.loads.count).toBe(0);
  });

  it('sends every player the same question, with nothing that gives the answer away', async () => {
    const { fixture, host, friend } = lobby();
    await startGame(host, fixture, friend);
    const asked = host.connection.last('question');
    expect(friend.connection.last('question')).toEqual(asked);
    expect(Object.keys(asked)).not.toContain('correct');
    expect(JSON.stringify(asked)).not.toMatch(/explanation|acceptedForms/);
    expect(host.connection.last('room').room.phase).toBe('question');
  });
});

describe('a game that cannot be set up', () => {
  it('tells the host when a quiz does not exist, and stays in the lobby', async () => {
    const { fixture, host } = lobby();
    const register = vi.spyOn(fixture.images, 'register');
    say(fixture.room, host.connection, {
      type: 'start',
      settings: settings({ quizIds: ['no-such-quiz'] }),
    });
    await vi.waitFor(() => {
      expect(host.connection.errors).toEqual(['INVALID_SETTINGS']);
    });
    expect(host.connection.last('room').room.phase).toBe('lobby');
    expect(register).not.toHaveBeenCalled();
  });

  it('tells the host when the chosen quizzes have too few questions', async () => {
    const { fixture, host } = lobby();
    say(fixture.room, host.connection, {
      type: 'start',
      settings: settings({ questionCount: 100 }),
    });
    await vi.waitFor(() => {
      expect(host.connection.errors).toEqual(['INVALID_SETTINGS']);
    });
  });

  it('reports a broken quiz file as a server fault, logging the file but not its content', async () => {
    const broken: QuizRepository = {
      load: () => Promise.reject(new ContentError('birds-w1-plumage.json', 'bad shape')),
    };
    const { fixture, host } = lobby({ repository: broken });
    say(fixture.room, host.connection, { type: 'start', settings: settings() });
    await vi.waitFor(() => {
      expect(host.connection.errors).toEqual(['INTERNAL_ERROR']);
    });
    expect(fixture.log.lines).toContainEqual({
      level: 'error',
      event: 'game.setup_failed',
      fields: { reason: 'bad-content:birds-w1-plumage.json' },
    });
  });
});

describe('a game that is being set up', () => {
  it('allows one game to be set up at a time', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: QuizRepository = {
      load: async () => {
        await held;
        return undefined;
      },
    };
    const { fixture, host } = lobby({ repository: slow });
    say(fixture.room, host.connection, { type: 'start', settings: settings() });
    say(fixture.room, host.connection, { type: 'start', settings: settings() });
    expect(host.connection.errors).toEqual(['WRONG_PHASE']);
    release();
    await vi.waitFor(() => {
      expect(host.connection.errors).toEqual(['WRONG_PHASE', 'INVALID_SETTINGS']);
    });
  });
});
