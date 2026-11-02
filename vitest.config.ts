import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages export their TypeScript source under "development" and built JavaScript by
  // default (so plain Node can run the server); tests and the type checker read the source.
  resolve: { conditions: ['development'] },
  test: {
    // Worker-level QA tests need a running Worker, so they run only through `npm run qa:ws`.
    exclude: [...configDefaults.exclude, 'packages/worker/test/qa/**'],
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'scripts/**/*.test.mjs',
    ],
  },
});
