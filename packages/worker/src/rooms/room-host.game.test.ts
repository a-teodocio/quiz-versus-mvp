import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@quiz-versus/protocol';
import { say } from '../../test/support/fake-connection.js';
import { lobby, startGame } from '../../test/support/game-helpers.js';
import { roomFixture } from '../../test/support/room-fixture.js';

describe('secrecy while a question is open', () => {
  it('keeps scores and correctness out of every message until the question closes', async () => {
    const fixture = roomFixture();
    const players = ['Ada', 'Bo', 'Cy', 'Di'].map((name) => fixture.join(name));
    const [host, ...others] = players;
    if (host === undefined) throw new Error('no host');
    await startGame(host, fixture, others[0] ?? host);
    const itemKey = host.connection.last('question').itemKey;
    for (const [index, player] of players.entries()) {
      say(fixture.room, player.connection, {
        type: 'answer',
        itemKey,
        answer: { kind: 'pick', index },
      });
    }
    const asked = host.connection.received.findIndex((message) => message.type === 'question');
    const before = host.connection.received.slice(
      asked,
      host.connection.received.findIndex((message) => message.type === 'reveal'),
    );
    for (const message of before) {
      if (message.type === 'room') {
        expect(message.room.players.map((player) => player.score)).toEqual([0, 0, 0, 0]);
      }
      expect(JSON.stringify(message)).not.toMatch(/explanation|acceptedForms|"correct"/);
    }
    const reveal = host.connection.last('reveal');
    expect(reveal.reason).toBe('all-answered');
    const awarded = reveal.results.filter((result) => result.points > 0);
    expect(awarded).toHaveLength(1);
  });
});

describe('playing a game', () => {
  it('closes a question at its deadline and lets the host move on to the results', async () => {
    const { fixture, host, friend } = lobby();
    await startGame(host, fixture, friend, { questionCount: 9 });
    for (let round = 0; round < 9; round += 1) {
      const question = host.connection.last('question');
      fixture.time.advance(question.durationMs);
      expect(host.connection.last('reveal')).toMatchObject({
        reason: 'timeout',
        itemKey: question.itemKey,
      });
      say(fixture.room, friend.connection, { type: 'next' });
      expect(friend.connection.errors).toEqual(['NOT_HOST']);
      friend.connection.clear();
      say(fixture.room, host.connection, { type: 'next' });
    }
    expect(host.connection.last('results').standings).toHaveLength(2);
    expect(fixture.time.pending).toBe(0);
  });

  it('serves every picture of the game under the name the question carries', async () => {
    const { fixture, host, friend } = lobby();
    await startGame(host, fixture, friend, { questionCount: 9 });
    const seen: string[] = [];
    for (let round = 0; round < 9; round += 1) {
      const question = host.connection.last('question');
      if (question.imageUrl !== undefined) {
        const alias = question.imageUrl.replace('/images/', '');
        expect(fixture.images.pathFor(alias)).toMatch(/^images\/demo-1001\/.+\.png$/);
        seen.push(alias);
      }
      fixture.time.advance(question.durationMs);
      say(fixture.room, host.connection, { type: 'next' });
    }
    expect(seen.length).toBeGreaterThan(0);
    say(fixture.room, host.connection, { type: 'leave' });
    say(fixture.room, friend.connection, { type: 'leave' });
    expect(seen.map((alias) => fixture.images.pathFor(alias))).toEqual(seen.map(() => undefined));
    expect(fixture.time.pending).toBe(0);
  });

  it('puts a player who comes back mid-question into it with the time that is left', async () => {
    const { fixture, host, friend } = lobby();
    await startGame(host, fixture, friend, { secondsPerQuestion: 20 });
    fixture.room.detach(friend.connection);
    fixture.time.advance(8_000);
    const back = fixture.connect();
    say(fixture.room, back, {
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name: 'Bo',
      resumeToken: friend.resumeToken,
    });
    expect(back.received.map((message) => message.type)).toEqual(['welcome', 'room', 'question']);
    expect(back.last('question').durationMs).toBe(12_000);
  });
});

describe('a game that ends early', () => {
  it('stops the question timer when everyone leaves mid-question', async () => {
    const { fixture, host, friend } = lobby();
    await startGame(host, fixture, friend);
    say(fixture.room, host.connection, { type: 'leave' });
    say(fixture.room, friend.connection, { type: 'leave' });
    expect(fixture.room.isClosed).toBe(true);
    expect(fixture.time.pending).toBe(0);
  });
});
