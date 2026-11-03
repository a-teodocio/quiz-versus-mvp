# @quiz-versus/web

The browser app. Today it is the real quiz app's page, forked as it is and pinned by tests; the lobby and the versus screens come in `feat/web-versus`.

- **Page:** `public/index.html`, a copy of the real app's page with a handful of documented edits. Where it came from and what differs is in [SOURCE.md](SOURCE.md). Do not edit it by hand: run `scripts/make-web-fork.mjs`, or (once the page is split into modules) change the modules.
- **Public API (`src/index.ts`):** `STORAGE_KEYS`, `RESUME_KEY_PREFIX` and `PROGRESS_EXPORT_PREFIX`, the names the page stores progress under. Nothing else imports the page.
- **May depend on:** `protocol` and `core`. Never on `worker` or `quiz-validator`. `src/` holds browser code and may not import Node built-ins; `test/` and `playwright.config.ts` run in Node.

## Running it

```
npm run web:dev      # the page and the real app's quiz API over content/ on http://127.0.0.1:3101
npm run test:web     # the Playwright tests that pin the page's behaviour (needs Chromium: `npx playwright install chromium`, once)
```

The browser tests use Playwright's own Chromium, the same on every machine. They start `web:dev` themselves, refuse every request that leaves `127.0.0.1`, seed `Math.random` in every test, and use the browser's fake clock where time matters. See [ADR 13](../../docs/adr/0013-playwright-for-browser-tests.md).

## Tests

- `src/**/*.test.ts`, `test/*.test.ts`: Vitest, part of `npm run check`. They guard the fork (its hash, no banned dashes, the storage keys).
- `test/fork/*.spec.ts`: Playwright, `npm run test:web`. They pin what the real page does; a failure after a change to the page is a change of behaviour, so it needs a fidelity row or a fix.
