import type { Clock, Random } from '@quiz-versus/core';
import type { IdSource } from '../../src/ports/id-source.js';
import type { CancelTimer, Scheduler } from '../../src/ports/scheduler.js';

/**
 * Time that moves only when a test says so. One object is both the `Clock` and the `Scheduler`,
 * so a timer set for 5 seconds fires exactly when the test advances the clock by 5 seconds.
 */
export class ManualTime implements Clock, Scheduler {
  private current: number;
  private nextId = 0;
  private readonly tasks = new Map<number, { at: number; task: () => void }>();

  constructor(start = 1_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  after(delayMs: number, task: () => void): CancelTimer {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { at: this.current + Math.max(0, delayMs), task });
    return () => {
      this.tasks.delete(id);
    };
  }

  /** Moves time forward and runs, in order, every task that has come due on the way. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = [...this.tasks.entries()]
        .filter(([, entry]) => entry.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (due === undefined) break;
      this.tasks.delete(due[0]);
      this.current = Math.max(this.current, due[1].at);
      due[1].task();
    }
    this.current = target;
  }

  /** How many tasks are waiting (a test for a leaked timer reads this). */
  get pending(): number {
    return this.tasks.size;
  }
}

/** A repeatable stream (mulberry32): tests must not depend on real randomness. */
export function seededRandom(seed: number): Random {
  let state = seed;
  return {
    next() {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Ids that count up, 22 characters long like the real ones: `id00000000000000000001`. */
export function countingIds(): IdSource {
  let count = 0;
  return {
    next() {
      count += 1;
      return `id${String(count).padStart(20, '0')}`;
    },
  };
}
