# 13. Playwright for browser tests, and a dev server for the forked page

Status: accepted (2026-11-02).

## Context

Roadmap step 5 forks the real quiz page as it is, pins its behaviour with tests, and only then splits it into modules. The page is one 4,000 line file of HTML, CSS and JavaScript that talks to the real app's small read-only API. The tests have to run the page in a real browser: it builds its screens in the DOM, reads `localStorage`, listens for keys, and keeps time with `setInterval` and `Date.now`. A DOM emulator would not exercise the focus, key and layout rules that ADR 9 and the accessibility scenarios depend on.

Two things were open: which browser test tool, and what serves the page and its API in a test (the real app uses a Python server that is not in this repo).

## Decision

**Playwright** (`@playwright/test`, a dev dependency of `packages/web`) runs the browser tests. Reasons: the roadmap, ADR 8 and the QA guard already assume it (`npm run qa:browser`); `page.clock` replaces the clock without real waits (ADR 9 asks for it); one test can open several browser contexts, which step 6 needs for three players; and the accessibility scan the practices require (axe) has a Playwright integration.

**Playwright's own Chromium** runs the tests, not a Chrome or Edge found on the machine. The browser is then the one the Playwright version pins, the same on every machine and in CI, and nothing depends on what is installed. `npx playwright install chromium` fetches it once (CI does this in a step of its own: Playwright has no install script and fetches a browser only when asked).

**A small Node server** (`scripts/web-dev-server.mjs`, `npm run web:dev`) serves the page and a port of the real app's quiz API over the fake content in `content/`. The tests start it through Playwright's `webServer` setting and use it over HTTP; a person can start it by hand and play. Its rules are the real server's (`quiz.py` v1.55.0): the same routes, shapes, grouping and refusals, with its own tests. Stubbing the API inside each test with `page.route` was the alternative; it was not chosen because nothing could then be run by hand, and the stubs would have to repeat the listing rules in every test that needs a list.

**The tests own the network.** Every request that leaves `127.0.0.1` is refused (the page asks Google for a font and falls back to a system font), and any error thrown in the page fails the test.

**The fork is generated, not edited.** `scripts/make-web-fork.mjs` makes `packages/web/public/index.html` from the real file, refuses a real file whose hash is not the recorded one, and applies a short list of edits that must each match exactly as often as listed. `SOURCE.md` records the source commit, both hashes and every difference, and a unit test fails if the committed page stops matching it.

## Consequences

- `@playwright/test` 1.64.1, with `playwright` and `playwright-core` of the same version, are new dependencies. They have no install script. The browser is not an npm package: it is downloaded from Playwright's own servers by `playwright install`, so `npm audit` and signature checks do not cover it. It is pinned by the Playwright version, only Chromium is fetched (CI also installs its operating-system libraries with apt), and only the test job runs it. Dependabot keeps the Playwright version moving, with its 14-day cooldown.
- CI gains a step that installs Chromium and a step that runs `npm run test:web`, inside the required `check` job. A pull request that breaks the page's behaviour fails `check`.
- A person needs the Chromium download (about 150 MB) once to run `npm run test:web`. `npm run check` does not need it: it holds only the unit tests.
- The pinned behaviours are the real app's. A failing test after a change to the page means the behaviour changed, so it needs a fix or a row in [fidelity.md](../fidelity.md).
- The fork's tests are written by the author and live in `packages/web/test/fork/`. The qa-tester's browser tests live in `e2e/qa/` and come with `feat/web-versus` (ADR 8).
- The dev server is a stand-in. Once the game server serves the page and a route that lists quizzes (roadmap step 7), the tests can run against it and the stand-in can go.
