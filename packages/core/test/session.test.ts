import { describe, expect, it } from 'vitest';
import { RoomSession } from '../src/room/session.js';
import { collectingLogger, manualClock } from './support/fakes.js';
import {
  messagesOfType,
  pickItem,
  planOf,
  playerIdOf,
  settingsFor,
  tokenOf,
} from './support/room-driver.js';

function sessionWithOnePlayer(): {
  session: RoomSession;
  clock: ReturnType<typeof manualClock>;
  logger: ReturnType<typeof collectingLogger>;
} {
  const clock = manualClock(5_000);
  const logger = collectingLogger();
  const session = new RoomSession('room-aaaaaaaaaaaaaaaa', { clock, logger });
  session.handle({
    type: 'join',
    name: 'Secret Name',
    identity: { playerId: playerIdOf(1), resumeToken: tokenOf(1) },
    resumeToken: undefined,
  });
  return { session, clock, logger };
}

describe('RoomSession', () => {
  it('stamps events with the time from the clock, so the deadline follows it', () => {
    const { session, clock } = sessionWithOnePlayer();
    clock.set(90_000);
    const effects = session.handle({
      type: 'start',
      playerId: playerIdOf(1),
      settings: settingsFor(1),
      plan: planOf([pickItem('i1')]),
    });
    expect(effects).toContainEqual({ type: 'setTimer', at: 90_000 + 30_000 });
    expect(session.state.phase).toBe('question');
  });

  it('closes the open question when the timer fires after the deadline', () => {
    const { session, clock } = sessionWithOnePlayer();
    session.handle({
      type: 'start',
      playerId: playerIdOf(1),
      settings: settingsFor(1),
      plan: planOf([pickItem('i1')]),
    });
    clock.advance(30_000);
    const effects = session.handle({ type: 'timerFired' });
    expect(messagesOfType(effects, 'reveal')[0]?.reason).toBe('timeout');
  });

  it('logs events and phase changes without names, tokens or answers', () => {
    const { session, logger } = sessionWithOnePlayer();
    session.handle({
      type: 'start',
      playerId: playerIdOf(1),
      settings: settingsFor(1),
      plan: planOf([pickItem('i1')]),
    });
    const text = logger.lines.join('\n');
    expect(text).toContain('room.phase');
    expect(text).not.toContain('Secret Name');
    expect(text).not.toContain('token-');
    expect(text).not.toContain('Alpha option');
  });

  it('keeps its state when an event is refused', () => {
    const { session } = sessionWithOnePlayer();
    const before = session.state;
    session.handle({ type: 'next', playerId: playerIdOf(1) });
    expect(session.state).toBe(before);
  });
});

describe('RoomSession logging of refusals', () => {
  it('logs the error code of a refused request, and nothing about who or what', () => {
    const { session, logger } = sessionWithOnePlayer();
    session.handle({ type: 'next', playerId: playerIdOf(1) });
    const line = logger.lines.at(-1) ?? '';
    expect(line).toContain('"refused":"WRONG_PHASE"');
    expect(line).not.toContain(playerIdOf(1));
  });
});
