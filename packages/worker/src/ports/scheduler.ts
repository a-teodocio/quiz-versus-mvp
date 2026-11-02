/** Cancels a scheduled task. Safe to call twice, or after the task has run. */
export type CancelTimer = () => void;

/**
 * Runs a task after a delay. The server's partner to core's `Clock`: core may not touch timers,
 * so the adapter owns them. Production uses `setTimeout`; tests advance a manual one by hand.
 */
export interface Scheduler {
  after(delayMs: number, task: () => void): CancelTimer;
}
