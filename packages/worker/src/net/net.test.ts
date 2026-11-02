import { describe, expect, it } from 'vitest';
import { ManualTime } from '../../test/support/manual-time.js';
import { isOriginAllowed } from './origin.js';
import { RateLimiter } from './rate-limiter.js';

describe('isOriginAllowed', () => {
  const listed = ['http://localhost:5173'];

  it('lets through a request that carries no Origin (a script or a test client)', () => {
    expect(isOriginAllowed(undefined, 'localhost:8787', listed)).toBe(true);
  });

  it('lets through the server’s own origin, whatever port it listens on', () => {
    expect(isOriginAllowed('http://localhost:8787', 'localhost:8787', [])).toBe(true);
    expect(isOriginAllowed('https://quiz.example', 'quiz.example', [])).toBe(true);
  });

  it('lets through a listed origin and nothing that only looks like it', () => {
    expect(isOriginAllowed('http://localhost:5173', 'localhost:8787', listed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5174', 'localhost:8787', listed)).toBe(false);
    expect(isOriginAllowed('http://localhost:5173.evil.example', 'localhost:8787', listed)).toBe(
      false,
    );
  });

  it('refuses other websites, an origin on another port, and one that is not a URL', () => {
    expect(isOriginAllowed('https://evil.example', 'localhost:8787', listed)).toBe(false);
    expect(isOriginAllowed('http://localhost:9999', 'localhost:8787', [])).toBe(false);
    expect(isOriginAllowed('null', 'localhost:8787', [])).toBe(false);
    expect(isOriginAllowed('https://evil.example', undefined, [])).toBe(false);
  });
});

describe('RateLimiter', () => {
  const limiter = (time: ManualTime): RateLimiter => new RateLimiter(time, 1_000, 3);

  it('allows the limit, tells off the next messages, and gives up on a flood', () => {
    const rate = limiter(new ManualTime());
    const verdicts = Array.from({ length: 7 }, () => rate.hit());
    expect(verdicts).toEqual(['ok', 'ok', 'ok', 'limited', 'limited', 'limited', 'abusive']);
  });

  it('starts a fresh count when the window has passed', () => {
    const time = new ManualTime();
    const rate = limiter(time);
    for (let hit = 0; hit < 5; hit += 1) rate.hit();
    time.advance(999);
    expect(rate.hit()).toBe('limited');
    time.advance(1);
    expect(rate.hit()).toBe('ok');
  });
});
