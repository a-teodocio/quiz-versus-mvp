import type { Logger } from '@quiz-versus/core';

/** Fields a log line may carry. Never answers, typed text, player names or resume tokens. */
export type LogFields = Readonly<Record<string, string | number | boolean>>;

/** Core's logger plus the error level the server needs for faults that are not the player's. */
export interface ServerLogger extends Logger {
  error(event: string, fields?: LogFields): void;
}
