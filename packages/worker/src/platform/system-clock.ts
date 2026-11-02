import type { Clock } from '@quiz-versus/core';

export const systemClock: Clock = {
  now: () => Date.now(),
};
