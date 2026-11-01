import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../src/room/messages.js';
import {
  RoomDriver,
  errorCodes,
  messagesOfType,
  pickItem,
  planOf,
  settingsFor,
  typedItem,
} from './support/room-driver.js';

function startedGame(
  players = 3,
  questions = 3,
): { room: RoomDriver; ids: string[]; host: string } {
  const room = new RoomDriver();
  const ids = room.joinMany(players);
  const host = ids[0] ?? '';
  room.start(
    host,
    planOf(Array.from({ length: questions }, (_, at) => pickItem(`i${String(at + 1)}`, at % 4))),
  );
  return { room, ids, host };
}

describe('starting', () => {
  it('opens the first question for everyone with a timer', () => {
    const room = new RoomDriver();
    const [host] = room.joinMany(2) as [string, string];
    const effects = room.start(host, planOf([pickItem('i1')]));
    expect(effects).toContainEqual({ type: 'setTimer', at: room.now + 30_000 });
    const [question] = messagesOfType(effects, 'question');
    expect(question).toMatchObject({
      itemKey: 'i1',
      mode: 'pick',
      durationMs: 30_000,
      progress: { kind: 'regular', position: 1, totalItems: 1 },
    });
    expect(room.state.phase).toBe('question');
  });

  it('refuses a start from someone who is not the host', () => {
    const room = new RoomDriver();
    const [, other] = room.joinMany(2) as [string, string];
    expect(errorCodes(room.start(other, planOf([pickItem('i1')])))).toEqual(['NOT_HOST']);
    expect(room.state.phase).toBe('lobby');
  });

  it('refuses a second start with WRONG_PHASE', () => {
    const { room, host } = startedGame();
    expect(errorCodes(room.start(host, planOf([pickItem('i9')])))).toEqual(['WRONG_PHASE']);
  });

  it('refuses a plan that does not match the settings with INVALID_SETTINGS', () => {
    const room = new RoomDriver();
    const [host] = room.joinMany(2) as [string, string];
    const effects = room.start(host, planOf([pickItem('i1')]), settingsFor(5));
    expect(errorCodes(effects)).toEqual(['INVALID_SETTINGS']);
    expect(room.state.phase).toBe('lobby');
  });
});

describe('answering', () => {
  it('acknowledges an accepted answer to the caller and marks the player answered', () => {
    const { room, ids } = startedGame();
    const effects = room.right(ids[1] ?? '');
    expect(messagesOfType(effects, 'answerAck')).toEqual([{ type: 'answerAck', itemKey: 'i1' }]);
    const answered = snapshotOf(room.state).players.filter((player) => player.answered);
    expect(answered.map((player) => player.id)).toEqual([ids[1]]);
  });

  it('refuses a second answer with ALREADY_ANSWERED', () => {
    const { room, ids } = startedGame();
    room.right(ids[1] ?? '');
    expect(errorCodes(room.right(ids[1] ?? ''))).toEqual(['ALREADY_ANSWERED']);
  });

  it('refuses an answer for another question with STALE_QUESTION', () => {
    const { room, ids } = startedGame();
    const effects = room.answer(ids[1] ?? '', { kind: 'pick', index: 0 }, 'i-old');
    expect(errorCodes(effects)).toEqual(['STALE_QUESTION']);
  });

  it('refuses an answer of the wrong kind with INVALID_ANSWER', () => {
    const { room, ids } = startedGame();
    expect(errorCodes(room.answer(ids[1] ?? '', { kind: 'type', text: 'hello' }))).toEqual([
      'INVALID_ANSWER',
    ]);
  });
});

describe('answers near the deadline and in small rooms', () => {
  it('treats an answer at exactly the deadline as late', () => {
    const { room, ids } = startedGame();
    room.now = room.open().open.deadline;
    expect(errorCodes(room.right(ids[0] ?? ''))).toEqual(['STALE_QUESTION']);
    expect(room.state.phase).toBe('reveal');
  });
});

describe('the two-player minimum', () => {
  it('starts with exactly two connected players', () => {
    const { room } = startedGame(2, 1);
    expect(room.state.phase).toBe('question');
  });

  it('refuses to start a versus game with one player', () => {
    const room = new RoomDriver();
    const [host] = room.joinMany(1) as [string];
    expect(errorCodes(room.start(host, planOf([pickItem('i1')])))).toEqual(['NOT_ENOUGH_PLAYERS']);
    expect(room.state.phase).toBe('lobby');
  });

  it('does not count a player who has dropped', () => {
    const room = new RoomDriver();
    const [host, other] = room.joinMany(2) as [string, string];
    room.send({ type: 'disconnect', playerId: other });
    expect(errorCodes(room.start(host, planOf([pickItem('i1')])))).toEqual(['NOT_ENOUGH_PLAYERS']);
  });
});

describe('the order of the start checks', () => {
  it('checks the phase before the number of players', () => {
    const { room, ids } = startedGame(2, 1);
    room.send({ type: 'disconnect', playerId: ids[1] ?? '' });
    expect(errorCodes(room.start(ids[0] ?? '', planOf([pickItem('i1')])))).toEqual(['WRONG_PHASE']);
  });

  it('checks the number of players before the settings', () => {
    const room = new RoomDriver();
    const [host] = room.joinMany(1) as [string];
    const effects = room.start(host, planOf([pickItem('i1')]), settingsFor(5));
    expect(errorCodes(effects)).toEqual(['NOT_ENOUGH_PLAYERS']);
  });

  it('checks the host before the number of players', () => {
    const room = new RoomDriver();
    room.joinMany(1);
    expect(errorCodes(room.start('stranger-0000000000', planOf([pickItem('i1')])))).toEqual([
      'NOT_HOST',
    ]);
  });

  it('refuses an answer from someone who has not joined', () => {
    const { room } = startedGame();
    const effects = room.answer('stranger-0000000000', { kind: 'pick', index: 0 });
    expect(errorCodes(effects)).toEqual(['NOT_JOINED']);
  });

  it('refuses an answer in the lobby and after the question has closed', () => {
    const lobby = new RoomDriver();
    const [host] = lobby.joinMany(2) as [string, string];
    expect(errorCodes(lobby.answer(host, { kind: 'pick', index: 0 }, 'i1'))).toEqual([
      'WRONG_PHASE',
    ]);

    const { room, ids } = startedGame(2);
    ids.forEach((id) => room.right(id));
    expect(room.state.phase).toBe('reveal');
    expect(errorCodes(room.answer(ids[0] ?? '', { kind: 'pick', index: 0 }, 'i1'))).toEqual([
      'STALE_QUESTION',
    ]);
  });

  it('closes the question and refuses an answer that arrives after the deadline', () => {
    const { room, ids } = startedGame();
    room.advance(31_000);
    const effects = room.right(ids[0] ?? '');
    expect(errorCodes(effects)).toEqual(['STALE_QUESTION']);
    expect(room.state.phase).toBe('reveal');
    expect(room.score(ids[0] ?? '')).toBe(0);
  });
});

describe('closing and revealing', () => {
  it('closes when every connected player has answered and scores 1 point per correct answer', () => {
    const { room, ids } = startedGame();
    room.right(ids[0] ?? '');
    room.wrong(ids[1] ?? '');
    const effects = room.right(ids[2] ?? '');
    const [reveal] = messagesOfType(effects, 'reveal');
    expect(reveal).toMatchObject({ itemKey: 'i1', reason: 'all-answered' });
    expect(reveal?.results.map((result) => [result.outcome, result.points, result.score])).toEqual([
      ['correct', 1, 1],
      ['wrong', 0, 0],
      ['correct', 1, 1],
    ]);
    expect(effects).toContainEqual({ type: 'clearTimer' });
    expect(room.state.phase).toBe('reveal');
  });

  it('reveals the correct option as shown, with its text and the explanation', () => {
    const { room, ids } = startedGame(2, 2);
    ids.forEach((id) => room.right(id));
    room.next(ids[0] ?? '');
    ids.forEach((id) => room.right(id));
    const reveal = room.state.phase === 'reveal' ? room.state.reveal : null;
    expect(reveal?.correct).toEqual({ kind: 'pick', index: 1, text: 'Bravo option' });
    expect(reveal?.explanation).toBe('Explanation i2.');
  });

  it('closes on timeout and marks players who did not answer', () => {
    const { room, ids } = startedGame();
    room.right(ids[0] ?? '');
    const effects = room.timeout();
    const [reveal] = messagesOfType(effects, 'reveal');
    expect(reveal?.reason).toBe('timeout');
    expect(reveal?.results.map((result) => result.outcome)).toEqual([
      'correct',
      'no-answer',
      'no-answer',
    ]);
    expect(reveal?.results[1]?.answer).toBeNull();
  });
});

describe('timers and absent players', () => {
  it('ignores a timer that fires early or after the question closed', () => {
    const { room, ids } = startedGame(2);
    expect(room.send({ type: 'timerFired' })).toEqual([]);
    expect(room.state.phase).toBe('question');
    ids.forEach((id) => room.right(id));
    room.advance(60_000);
    expect(room.send({ type: 'timerFired' })).toEqual([]);
    expect(room.state.phase).toBe('reveal');
  });

  it('does not wait for a player who has disconnected', () => {
    const { room, ids } = startedGame();
    room.right(ids[0] ?? '');
    room.right(ids[1] ?? '');
    room.send({ type: 'disconnect', playerId: ids[2] ?? '' });
    expect(room.state.phase).toBe('reveal');
  });

  it('waits for the timeout when nobody is connected to answer', () => {
    const { room, ids } = startedGame(2);
    ids.forEach((id) => room.send({ type: 'disconnect', playerId: id }));
    expect(room.state.phase).toBe('question');
    room.timeout();
    expect(room.state.phase).toBe('reveal');
  });
});

describe('moving on', () => {
  it('lets only the host move on, and only from a reveal', () => {
    const { room, ids } = startedGame(2);
    expect(errorCodes(room.next(ids[0] ?? ''))).toEqual(['WRONG_PHASE']);
    ids.forEach((id) => room.right(id));
    expect(errorCodes(room.next(ids[1] ?? ''))).toEqual(['NOT_HOST']);
    room.next(ids[0] ?? '');
    expect(room.open().open.item.key).toBe('i2');
  });

  it('shows the standings after the last question, best first with shared ranks', () => {
    const { room, ids, host } = startedGame(4, 2);
    const [a = '', b = '', c = '', d = ''] = ids;
    // Round 1: a, b and c right. Round 2: a and d right. Scores: a 2, b 1, c 1, d 1.
    [a, b, c].forEach((id) => room.right(id));
    room.wrong(d);
    room.next(host);
    [a, d].forEach((id) => room.right(id));
    [b, c].forEach((id) => room.wrong(id));
    expect(room.state.phase).toBe('reveal');
    room.next(host);
    const results = room.state.phase === 'results' ? room.state.results : null;
    expect(results?.standings.map((row) => [row.playerId, row.rank, row.score])).toEqual([
      [a, 1, 2],
      [b, 2, 1],
      [c, 2, 1],
      [d, 2, 1],
    ]);
  });
});

describe('typed answers', () => {
  function typedGame(): { room: RoomDriver; ids: string[] } {
    const room = new RoomDriver();
    const ids = room.joinMany(3);
    room.start(ids[0] ?? '', planOf([typedItem('i1')]));
    return { room, ids };
  }

  it('sends a typed question with no options', () => {
    const { room } = typedGame();
    const message = room.open();
    expect(message.open.item.mode).toBe('type');
  });

  it('grades with the real app rules: right, near miss (still wrong) and wrong', () => {
    const { room, ids } = typedGame();
    room.answer(ids[0] ?? '', { kind: 'type', text: '  the ZORBULINS ' });
    room.answer(ids[1] ?? '', { kind: 'type', text: 'zorbulim' });
    const effects = room.answer(ids[2] ?? '', { kind: 'type', text: 'something else' });
    const [reveal] = messagesOfType(effects, 'reveal');
    expect(reveal?.correct).toEqual({
      kind: 'type',
      text: 'Zorbulin',
      acceptedForms: ['Zorbulin'],
    });
    expect(reveal?.results.map((result) => [result.outcome, result.near])).toEqual([
      ['correct', false],
      ['wrong', true],
      ['wrong', false],
    ]);
  });

  it('refuses a pick answer to a typed question', () => {
    const { room, ids } = typedGame();
    expect(errorCodes(room.pick(ids[0] ?? '', 1))).toEqual(['INVALID_ANSWER']);
  });
});
