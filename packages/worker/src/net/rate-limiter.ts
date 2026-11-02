import type { Clock } from '@quiz-versus/core';

/** Over the limit by this many times, a connection is closed instead of just told off. */
const ABUSE_FACTOR = 2;

/** `ok`: handle it. `limited`: refuse it with `RATE_LIMITED`. `abusive`: close the connection. */
export type RateVerdict = 'ok' | 'limited' | 'abusive';

/**
 * Counts the messages of one connection in fixed windows. A new window starts at the first
 * message after the old one ends, so a burst at the edge can be up to twice the limit, which
 * is fine for protecting the server and cheap to keep.
 */
export class RateLimiter {
  private windowStart = Number.NEGATIVE_INFINITY;
  private count = 0;

  constructor(
    private readonly clock: Clock,
    private readonly windowMs: number,
    private readonly maxPerWindow: number,
  ) {}

  /** Records one message and says what to do with it. */
  hit(): RateVerdict {
    const now = this.clock.now();
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    if (this.count > this.maxPerWindow * ABUSE_FACTOR) return 'abusive';
    return this.count > this.maxPerWindow ? 'limited' : 'ok';
  }
}
