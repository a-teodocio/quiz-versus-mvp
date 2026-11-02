import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@quiz-versus/protocol';
import type { RoomSnapshot, ServerMessage } from '@quiz-versus/protocol';
import { createDiskQuizRepository } from '../content/disk-quiz-repository.js';
import { fakeContentRoot } from '../../test/support/content-root.js';
import { say } from '../../test/support/fake-connection.js';
import type { FakeConnection } from '../../test/support/fake-connection.js';
import { startGame } from '../../test/support/game-helpers.js';
import { roomFixture } from '../../test/support/room-fixture.js';
import type { Player, RoomFixture } from '../../test/support/room-fixture.js';

/** Every explanation in a quiz: text that must never be sent while a question is open. */
async function explanationsOf(quizId: string): Promise<string[]> {
  const quiz = await createDiskQuizRepository(fakeContentRoot).load(quizId);
  return (quiz?.entries ?? []).flatMap((entry) =>
    entry.type === 'image-group'
      ? entry.parts.map((part) => part.explanation)
      : [entry.explanation],
  );
}

/** What was sent to a socket before its first reveal. */
const beforeReveal = (connection: FakeConnection): ServerMessage[] => {
  const at = connection.received.findIndex((message) => message.type === 'reveal');
  return at < 0 ? connection.received : connection.received.slice(0, at);
};

function expectNothingGivenAway(
  messages: ServerMessage[],
  explanations: string[],
  tiebreak: RoomSnapshot['tiebreak'] = null,
): void {
  for (const message of messages) {
    const text = JSON.stringify(message);
    expect(text).not.toMatch(/acceptedForms|"correct"|"explanation"/);
    for (const explanation of explanations) expect(text).not.toContain(explanation);
    if (message.type === 'room') {
      expect(message.room.tiebreak).toEqual(tiebreak);
      expect(message.room.players.every((player) => player.score === 0)).toBe(true);
    }
  }
}

function threePlayers(): { fixture: RoomFixture; players: Player[] } {
  const fixture = roomFixture();
  return { fixture, players: ['Ada', 'Bo', 'Cy'].map((name) => fixture.join(name)) };
}

describe('nothing about correctness is sent while a question is open', () => {
  it('holds for every player, with answers and a resume in the middle', async () => {
    const { fixture, players } = threePlayers();
    const [host, second, third] = players;
    if (host === undefined || second === undefined || third === undefined) throw new Error('setup');
    await startGame(host, fixture, second);
    const itemKey = host.connection.last('question').itemKey;
    say(fixture.room, host.connection, {
      type: 'answer',
      itemKey,
      answer: { kind: 'pick', index: 0 },
    });
    fixture.room.detach(third.connection);
    const back = fixture.connect();
    say(fixture.room, back, {
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      name: 'Cy',
      resumeToken: third.resumeToken,
    });
    const explanations = await explanationsOf('birds-w1-plumage');
    for (const connection of [host.connection, second.connection, back]) {
      expect(beforeReveal(connection).some((message) => message.type === 'question')).toBe(true);
      expectNothingGivenAway(beforeReveal(connection), explanations);
    }
  });

  it('holds in a typed game, where the question has no options at all', async () => {
    const { fixture, players } = threePlayers();
    const [host, second] = players;
    if (host === undefined || second === undefined) throw new Error('setup');
    await startGame(host, fixture, second, {
      quizIds: ['rocks-w1-identification'],
      answerBy: 'type',
      questionCount: 5,
    });
    const asked = host.connection.last('question');
    expect(asked.mode).toBe('type');
    expect(Object.keys(asked)).not.toContain('options');
    expectNothingGivenAway(
      beforeReveal(host.connection),
      await explanationsOf('rocks-w1-identification'),
    );
  });
});

describe('nothing changes while a tie-break question is open', () => {
  it('keeps the tie-break group and the scores as the last reveal left them, even after an answer', async () => {
    const { fixture, players } = threePlayers();
    const [host, second] = players;
    if (host === undefined || second === undefined) throw new Error('setup');
    await startGame(host, fixture, second, { questionCount: 2 });
    for (let round = 0; round < 2; round += 1) {
      fixture.time.advance(host.connection.last('question').durationMs);
      say(fixture.room, host.connection, { type: 'next' });
    }
    const tiebreak = host.connection.last('question');
    expect(tiebreak.progress.kind).toBe('tiebreak');
    say(fixture.room, host.connection, {
      type: 'answer',
      itemKey: tiebreak.itemKey,
      answer: { kind: 'pick', index: 0 },
    });
    expect(host.connection.ofType('answerAck').at(-1)?.itemKey).toBe(tiebreak.itemKey);
    const atReveal = host.connection
      .ofType('room')
      .filter((message) => message.room.phase === 'reveal')
      .at(-1)?.room.tiebreak;
    expect(atReveal).toBeTruthy();
    const explanations = await explanationsOf('birds-w1-plumage');
    for (const player of players) {
      const sent = player.connection.received;
      const from = sent.lastIndexOf(player.connection.last('question'));
      expectNothingGivenAway(sent.slice(from), explanations, atReveal);
    }
  });
});
