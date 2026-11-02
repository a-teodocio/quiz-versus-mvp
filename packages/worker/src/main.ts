// The command that runs the server: `node packages/worker/dist/src/main.js` (after `npm run build`).
// Settings come from environment variables; see `loadConfig`.
import { cwd, env, exit, on, stdout } from 'node:process';
import { loadConfig } from './config/server-config.js';
import { cryptoIds } from './platform/crypto-ids.js';
import { cryptoRandom } from './platform/crypto-random.js';
import { createJsonLogger } from './platform/json-logger.js';
import { systemClock } from './platform/system-clock.js';
import { systemScheduler } from './platform/system-scheduler.js';
import { startServer } from './server/start-server.js';

const logger = createJsonLogger((line) => stdout.write(`${line}\n`), systemClock);

try {
  const server = await startServer(loadConfig(env, cwd()), {
    clock: systemClock,
    scheduler: systemScheduler,
    random: cryptoRandom,
    ids: cryptoIds,
    logger,
  });
  const stop = (signal: string): void => {
    logger.info('server.stopping', { signal });
    server.close().then(
      () => {
        exit(0);
      },
      () => {
        exit(1);
      },
    );
  };
  on('SIGINT', () => {
    stop('SIGINT');
  });
  on('SIGTERM', () => {
    stop('SIGTERM');
  });
} catch (error) {
  logger.error('server.failed_to_start', {
    error: error instanceof Error ? error.name : 'unknown',
  });
  exit(1);
}
