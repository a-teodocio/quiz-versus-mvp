// `npm run qa:ws [-- --grep <id> --workers <n> --retries <n> --reporter list|line|dot]`
// Runs the qa-tester's server-level tests (packages/worker/test/qa/) against the server that
// `npm run qa:start` started. The ordinary test run leaves these out (see vitest.config.ts).
import { spawnSync } from 'node:child_process';
import { argv, env, execPath, exit, stderr } from 'node:process';
import { vitestArguments } from './qa-ws-args.mjs';
import { vitestEntry } from './vitest-entry.mjs';

const parsed = vitestArguments(argv.slice(2));
if ('error' in parsed) {
  stderr.write(`qa:ws: ${parsed.error}\n`);
  exit(2);
}

const run = spawnSync(
  execPath,
  [vitestEntry(), 'run', 'packages/worker/test/qa', '--passWithNoTests', ...parsed.args],
  { stdio: 'inherit', env: { ...env, QUIZ_VERSUS_QA: '1' } },
);
exit(run.status ?? 1);
