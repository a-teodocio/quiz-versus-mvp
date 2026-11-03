import { env } from 'node:process';
import { defineConfig } from '@playwright/test';

/** Not 3001, the port of the real app, so both can run side by side. */
const PORT = 3101;
const baseURL = `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: 'test/fork',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: env.CI !== undefined,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    // Playwright's own Chromium, which the Playwright version pins, so every machine and CI run
    // the same browser. Install it once with `npx playwright install chromium`.
    browserName: 'chromium',
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1000, height: 900 },
  },
  webServer: {
    command: 'node scripts/web-dev-server.mjs',
    cwd: '../..',
    url: `${baseURL}/api/courses`,
    env: { PORT: String(PORT) },
    reuseExistingServer: env.CI === undefined,
  },
});
