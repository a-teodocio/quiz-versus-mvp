import type { Clock } from '@quiz-versus/core';
import type { LogFields, ServerLogger } from '../ports/server-logger.js';

/** Receives one finished line of text, without a trailing newline. */
export type LineSink = (line: string) => void;

/**
 * Writes one JSON object per event. The caller passes only what is safe to log (see
 * `ServerLogger`); this adds the time and the level.
 */
export function createJsonLogger(sink: LineSink, clock: Clock): ServerLogger {
  const write = (level: 'info' | 'error', event: string, fields: LogFields | undefined): void => {
    sink(JSON.stringify({ time: clock.now(), level, event, ...fields }));
  };
  return {
    info: (event, fields) => {
      write('info', event, fields);
    },
    error: (event, fields) => {
      write('error', event, fields);
    },
  };
}
