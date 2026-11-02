import type { Scheduler } from '../ports/scheduler.js';

/** Timers that do not keep the process alive on their own: the open server does that. */
export const systemScheduler: Scheduler = {
  after(delayMs, task) {
    const handle = setTimeout(task, Math.max(0, delayMs));
    handle.unref();
    return () => {
      clearTimeout(handle);
    };
  },
};
