import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
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
