import type { Clock } from '../../src/ports/clock.js';
import type { Logger } from '../../src/ports/logger.js';
import type { Random } from '../../src/ports/random.js';

/** Returns the given numbers in order, then cycles. Fails loudly if given none. */
export function fixedRandom(numbers: readonly number[]): Random {
  let at = 0;
  return {
    next(): number {
      const value = numbers[at % numbers.length];
      if (value === undefined) throw new Error('fixedRandom needs at least one number');
      at += 1;
      return value;
    },
  };
}

/** A small deterministic generator for tests that need many different numbers. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}

export interface ManualClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
}

export function manualClock(start = 1_000_000): ManualClock {
  let now = start;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
    },
    set(ms) {
      now = ms;
    },
  };
}

export interface CollectingLogger extends Logger {
  readonly lines: string[];
}

export function collectingLogger(): CollectingLogger {
  const lines: string[] = [];
  const write = (
    level: string,
    event: string,
    fields?: Readonly<Record<string, unknown>>,
  ): void => {
    lines.push(`${level} ${event} ${JSON.stringify(fields ?? {})}`);
  };
  return {
    lines,
    info: (event, fields) => {
      write('info', event, fields);
    },
  };
}
