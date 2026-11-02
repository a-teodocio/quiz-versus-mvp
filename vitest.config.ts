import { env } from 'node:process';
import { configDefaults, defineConfig } from 'vitest/config';

/** `npm run qa:ws` sets this: only then do the server-level QA tests run (they need `qa:start`). */
const qaRun = env.QUIZ_VERSUS_QA === '1';

export default defineConfig({
  // Workspace packages export their TypeScript source under "development" and built JavaScript by
  // default (so plain Node can run the server); tests and the type checker read the source.
  resolve: { conditions: ['development'] },
  test: {
    // Worker-level QA tests need a running server, so they run only through `npm run qa:ws`.
    exclude: qaRun
      ? configDefaults.exclude
      : [...configDefaults.exclude, 'packages/worker/test/qa/**'],
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'scripts/**/*.test.mjs',
    ],
  },
});
