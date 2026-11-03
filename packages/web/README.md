# @quiz-versus/web

The browser app. Today it is the real quiz app's page, forked as it is and pinned by tests; the lobby and the versus screens come in the web-versus series (roadmap 5b to 5e).

- **Page:** `public/index.html` with `public/css/*.css` and `public/js/*.js`, a copy of the real app's page with a handful of documented edits, cut into files that load as plain scripts and stylesheets ([ADR 14](../../docs/adr/0014-forked-page-cut-into-plain-files.md)). Where it came from and what differs is in [SOURCE.md](SOURCE.md). The files are the real app's code as it is: do not edit them by hand or reformat them; run `scripts/make-web-fork.mjs`, or, in a branch that retires the hash test, change them on purpose.
- **Public API (`src/index.ts`):** `STORAGE_KEYS`, `RESUME_KEY_PREFIX` and `PROGRESS_EXPORT_PREFIX`, the names the page stores progress under. Nothing else imports the page.
- **May depend on:** `protocol` and `core`. Never on `worker` or `quiz-validator`. `src/` holds browser code and may not import Node built-ins; `test/` and `playwright.config.ts` run in Node.

## Running it

```
npm run web:dev      # the page and the real app's quiz API over content/ on http://127.0.0.1:3101
npm run test:web     # the Playwright tests that pin the page's behaviour (needs Chromium: `npx playwright install chromium`, once)
```

The browser tests use Playwright's own Chromium, the same on every machine. They start `web:dev` themselves, refuse every request that leaves `127.0.0.1`, seed `Math.random` in every test, and use the browser's fake clock where time matters. See [ADR 13](../../docs/adr/0013-playwright-for-browser-tests.md).

## Tests

- `src/**/*.test.ts`, `test/*.test.ts`: Vitest, part of `npm run check`. They guard the fork (its hash once the files are put back, that every file is loaded once, no banned dashes, the storage keys).
- `test/fork/*.spec.ts`: Playwright, `npm run test:web`. They pin what the real page does; a failure after a change to the page is a change of behaviour, so it needs a fidelity row or a fix.
