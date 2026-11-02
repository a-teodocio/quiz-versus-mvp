import { describe, expect, it, vi } from 'vitest';
import { OPAQUE_ID_MAX_LENGTH, OPAQUE_ID_MIN_LENGTH } from '@quiz-versus/protocol';
import { cryptoIds } from './crypto-ids.js';
import { cryptoRandom } from './crypto-random.js';
import { createJsonLogger } from './json-logger.js';
import { systemScheduler } from './system-scheduler.js';

describe('cryptoIds', () => {
  it('makes URL-safe ids of an accepted length that do not repeat', () => {
    const ids = Array.from({ length: 500 }, () => cryptoIds.next());
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(id.length).toBeGreaterThanOrEqual(OPAQUE_ID_MIN_LENGTH);
      expect(id.length).toBeLessThanOrEqual(OPAQUE_ID_MAX_LENGTH);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cryptoRandom', () => {
  it('stays in [0, 1) and is not constant', () => {
    const values = Array.from({ length: 1000 }, () => cryptoRandom.next());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(990);
  });
});

describe('createJsonLogger', () => {
  it('writes one JSON line with the time, level, event and fields', () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line), { now: () => 42 });
    logger.info('room.opened', { rooms: 1 });
    logger.error('socket.failed', { code: 'X' });
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { time: 42, level: 'info', event: 'room.opened', rooms: 1 },
      { time: 42, level: 'error', event: 'socket.failed', code: 'X' },
    ]);
  });
});

describe('systemScheduler', () => {
  it('runs a task after the delay and not after it is cancelled', () => {
    vi.useFakeTimers();
    try {
      const ran = vi.fn();
      const cancelled = vi.fn();
      systemScheduler.after(100, ran);
      const cancel = systemScheduler.after(100, cancelled);
      cancel();
      cancel();
      vi.advanceTimersByTime(100);
      expect(ran).toHaveBeenCalledOnce();
      expect(cancelled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
