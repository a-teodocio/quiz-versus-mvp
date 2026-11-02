# Roadmap and status

The continuity file. A new session reads this after `CLAUDE.md` to learn where the project is and what comes next. It is updated at the end of every branch (see "How to keep this current").

Last updated: 2026-11-02 (in `feat/worker`: the Node game server, ADRs 11 and 12)

## Goal

Trial a live multiplayer (versus) mode for the user's MLS quiz app on a small, fake-content mock: invite a friend by link, join a room of 2 or more players (a game needs two connected players to start; solo play is the real app's own mode), answer the same random questions, and compete for the highest score. The mock must stay true to the real app's behaviour, and be built to production standards, so the lessons and much of the code can move to the real app. The experiment ends with `LESSONS.md`.

The real app (a local Python server plus one large `index.html`) lives in the user's vault, folder `knowledge training`. It is read-only reference from this repo. Its question schema, shuffle, image-groups, typed answers and progress keys are what the mock must reproduce.

## Decisions already made

| Decision                                                                                                                                                                                                                                                                                 | Where recorded                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Server: a plain Node WebSocket server (`ws`), authoritative for scoring, one process holding the rooms; the host is not chosen. Replaces the Cloudflare plan. Reason: `wrangler` fails the dependency rules. Cost: a restart ends every room                                             | `adr/0011-node-websocket-server.md` (supersedes ADR 2) |
| The server checks quiz files with zod (shape only) where they are read; `protocol` is unchanged                                                                                                                                                                                          | `adr/0012-zod-for-quiz-files-in-the-server.md`         |
| TypeScript, npm workspaces, layer rules enforced by ESLint                                                                                                                                                                                                                               | `adr/0003-typescript-and-workspaces.md`                |
| Fake content only; the repo is public                                                                                                                                                                                                                                                    | `CLAUDE.md`                                            |
| Fork the real `index.html` verbatim first, pin its behaviour with tests, then split it                                                                                                                                                                                                   | this file, step 5                                      |
| Hold TypeScript at 6.x until `typescript-eslint` supports 7                                                                                                                                                                                                                              | `known-issues.md`, `dependency-vetting.md`             |
| Review by the `standards-reviewer` subagent before major PRs, not a required CI check yet                                                                                                                                                                                                | `CLAUDE.md`, `review-checklist.md`                     |
| zod validates every message at the boundary, inside `packages/protocol` only                                                                                                                                                                                                             | `adr/0004-zod-for-boundary-validation.md`              |
| Wire protocol (version 3): strict JSON messages, `question` never carries the answer                                                                                                                                                                                                     | `protocol.md`                                          |
| Versus needs 2 connected players to start (protocol 3, `NOT_ENOUGH_PLAYERS`); solo play is the real app's own mode                                                                                                                                                                       | `adr/0007-core-state-machine.md`, `protocol.md`        |
| The qa-tester writes end-user tests and judges functionality, usability and accessibility (WCAG 2.2 AA); a hook holds it to an allowlist                                                                                                                                                 | `adr/0008-qa-tester-sandbox.md`, `qa-scenarios.md`     |
| The keys 1 to 4 work only while focus is in the question area and can be switched off; a warning shows when 10 seconds remain                                                                                                                                                            | `adr/0009-player-interface-rules.md`                   |
| Core state machine: pure `step(state, event)`, game prepared before `start`, time as data, answers held until the reveal, item keys and image aliases issued by core, host hand-over rules                                                                                               | `adr/0007-core-state-machine.md`                       |
| Versus game rules: 1 point per correct answer (times a multiplier that is 1 for now), close when all connected players have answered, late joining allowed, tie-break questions for first place, equal scores share a rank                                                               | `adr/0006-versus-game-rules.md`                        |
| Players per room: 8 for now (provisional, one constant: `MAX_PLAYERS_PER_ROOM`)                                                                                                                                                                                                          | `protocol.md`, `packages/protocol/src/limits.ts`       |
| Versus asks for typed text only where the real app can auto-check it; the rest stay multiple choice                                                                                                                                                                                      | `fidelity.md`                                          |
| The owner's PRs merge themselves once `check` passes; a draft is held back                                                                                                                                                                                                               | `adr/0005-auto-merge-owner-pull-requests.md`           |
| The real validator is ported as its own package, `quiz-validator`, with pure checks, a disk adapter, parity fixtures made by running the real tool, and a content test inside `check`; "options that shuffle to the same position" is a property of a fixed `Random`, not of the content | `adr/0010-quiz-validator-package.md`, `fidelity.md`    |
| Pictures are served as `/images/<alias>` from one index across rooms (added at game start, released when the room closes; a name that collides makes the server prepare the game again)                                                                                                  | `adr/0011-node-websocket-server.md`                    |
| Packages export source under the `development` condition and built JavaScript by default, so plain Node can run them                                                                                                                                                                     | `folder-structure.md`, `architecture.md`               |

## Server platform

Why the server is a Node process and not Cloudflare is in [ADR 11](adr/0011-node-websocket-server.md). In short: `wrangler` 4.151.1 (the newest at least 14 days old) fails `npm audit --audit-level=high` and adds install scripts, the Workers runtime needs Vitest 4, and the host is undecided. The cost is that one process holds every room, so a restart or deploy ends every game and resume token. `ws` 8.22.0 and `@types/ws` 8.18.2 are vetted ([dependency-vetting.md](dependency-vetting.md)).

## Status

| Area                                                                       | State                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tooling: TypeScript, ESLint layer rules, Prettier, hooks, Vitest           | Done                                                                      |
| CI: lint, structure, format, typecheck, test, build, audit, signatures     | Done, `check` is a required status                                        |
| Branch protection on `main`                                                | Done: PR required, `check` required, no force push or deletion            |
| Docs: practices, architecture, checklist, vetting, structure, ADRs 1 to 12 | Done                                                                      |
| `standards-reviewer` subagent                                              | Done, run on `feat/core` (see its pull request)                           |
| Dependabot                                                                 | Weekly, 14-day cooldown, TypeScript major bumps ignored                   |
| `packages/protocol`: schemas, codec, tests, `docs/protocol.md`             | Done and merged (protocol version 3)                                      |
| `packages/core`: ports, shuffle, typed answers, scoring, state machine     | Done and merged                                                           |
| `content/`: two fake courses, 5 quiz files, 7 generated pictures           | Done; the port passes it strictly, and the real tool did when run by hand |
| `packages/quiz-validator`: port of the real validator, parity fixtures     | Done and merged                                                           |
| `packages/worker`: Node server, rooms in memory, routes, sockets, pictures | Built in `feat/worker` (reviewer and qa-tester runs in the pull request)  |
| `packages/web`                                                             | **Not started**                                                           |

## Next steps, in order

Each step is its own `feat/` branch, merged by pull request. Run `npm run check` and the standards-reviewer before opening the PR for steps 1, 2, 3 (it adds a package), 4 and 5. From step 4 (`feat/worker`) the `qa-tester` also plays the scenarios in [qa-scenarios.md](qa-scenarios.md) that the step makes runnable (see `CLAUDE.md`).

1. ~~**`feat/protocol`**~~: done. zod schemas, error codes, protocol version, decoders and encoders, `docs/protocol.md`, ADR 4. ~~**`feat/protocol-game-rules`**~~: done. Protocol v2 for the game rules in ADR 6 (tie-break, late joining).
2. ~~**`feat/core`**~~: done. `packages/core`. Ports `Clock`, `Random`, `QuizRepository`, `Logger`. Room state machine (LOBBY, QUESTION, REVEAL, RESULTS, with a tie-break inside it) as a pure function of state and event, returning new state and effects, implementing the rules in ADR 6. Scoring through a `ScoringRule` (1 point times a multiplier that is 1 for now). `prepareGame` loads through `QuizRepository` and sets aside the tie-break reserve (ADR 7). Shuffle that maps `correct` exactly as the real app does, drawing from the injected `Random`. Unit tests, plus parity fixtures copied from the real app into `packages/core/test/fixtures/real-app/` with a `SOURCE.md` recording the source commit.
3. ~~**`feat/content`**~~: done. `content/` (registry, 5 quiz files in 2 courses, 7 generated pictures: text, image, image-group with 2 and 3 parts and a follow-up part, typed answers a check accepts and ones it cannot, awkward whitespace) and `packages/quiz-validator` (a port of `tools/validate_quiz.py` with 17 parity cases made from the real tool's output). The content test in `npm run check` fails if a case the roadmap asked for goes missing. The quiz id is the file name without `.json`, and a file's `questions` become `Quiz.entries`; `test/support/content-files.ts` does that with a cast, which is a test shortcut. The worker must parse quiz files with a schema where they enter (checklist B1).
4. ~~**`feat/worker`**~~: done (see its pull request for the reviewer and tester verdicts). `packages/worker` is a Node server on `ws` ([ADR 11](adr/0011-node-websocket-server.md)): `POST /rooms`, `GET /rooms/<id>` upgrade, `GET /images/<alias>`; origin check; rooms and rooms per address capped; idle rooms closed; a join deadline; message rate; ping and pong; quiz files and pictures from disk, checked ([ADR 12](adr/0012-zod-for-quiz-files-in-the-server.md)); answers withheld until the reveal, with secrecy tests over fake sockets and game tests over real sockets; `npm run qa:start`, `qa:stop` and `qa:ws`. Still to do from the old list, in later steps: a route or message that lists the quizzes (the lobby needs it, see Open questions), TLS and static files (step 7).
5. **`feat/web-fork`, then `feat/web-versus`**: `packages/web`. First fork the real `index.html` verbatim and pin its behaviour with Playwright tests, then split it into modules. Then add the lobby and versus UI. Keep game rules out of view code. Escape all player-supplied text. Apply the key and warning rules of ADR 9 after the verbatim fork is pinned by tests, each with its fidelity row. **The server leaves these to the client** (found by the qa-tester in `feat/worker`, scenarios X11 and X12): (1) the host's client needs a way to learn which quizzes exist, see Open questions; (2) check the room id shape (16 to 64 URL-safe characters) before connecting, because a shorter link is refused with a bare HTTP 404 at the upgrade, which a browser cannot read, so a link cut short by a chat app would look like a broken connection instead of "room not found"; (3) word the HTTP refusals as sentences (`403 ORIGIN_NOT_ALLOWED`, `503 SERVER_FULL`, `503 TOO_MANY_ROOMS` carry only a code); (4) word `next` during a question ("There is no reveal to move on from." uses an internal word) and never show an error code.
6. **`feat/e2e`**: `e2e/`. Three browsers play a full game against the local stack. The author owns the helpers and the Playwright configuration; the qa-tester owns `e2e/qa/` (see ADR 8). Add `e2e/` to ESLint and typecheck, and vet Playwright and axe.
7. **Deploy**: pick a host, then deploy the Node server and serve the web client from it (one app on one URL). Gate: no open P1 in [parked-product-questions.md](parked-product-questions.md) and every core question answered; review the P2 ones before promoting. The user creates the account; Claude supplies the exact commands. A temporary tunnel to the user's own machine is enough for early play-tests before this step.
8. **`docs/lessons`**: write `LESSONS.md` (what worked, what to change, a port checklist for the real app). Update `docs/fidelity.md` throughout, not just here.

## Fidelity items to reproduce from the real app

Check these against the real app before declaring a step done. Anything not reproduced is recorded in `docs/fidelity.md`.

- Quiz JSON schema: `text`, `image`, `image-group` entries; group parts; `correct` indexes the unshuffled options.
- Option shuffle and the mapping of the correct index afterwards.
- Typed answers and how they are compared.
- Progress keys per entry and per group part (`entryKeys()` in the page, `entry_keys()` in `quiz.py`).
- Scoring in scored parts, not entries (a group counts once per part).
- Keyboard use (1 to 4 to answer, Enter or Space to advance), except as recorded in `fidelity.md` (the digit keys follow ADR 9), image zoom, theme tokens.

## Open questions

- Where the server is hosted (undecided). Rough prices seen on 2026-11-02 from third-party summaries, to be checked on the providers' own pages: Fly.io from about $2 a month, Render Starter $7 (its free tier sleeps, which drops rooms), Railway Hobby $5 plus usage, a small VPS about $4 to $5. Cloudflare's Workers Free plan could also carry the app (Durable Objects on the free plan allow 100,000 requests and 13,000 GB-s of duration a day, about 86 twenty-minute games), kept as a later adapter.
- How the host's client learns which quizzes exist. The server knows the ids (`listQuizIds`) but no route or message sends them. Decide in `feat/web-versus` (a `GET /quizzes` route is the likely answer; it is a new route, not a protocol message), and record the row in `fidelity.md`.
- No core product questions are waiting. The parked questions, ranked P1 to P3, are in [parked-product-questions.md](parked-product-questions.md).
- The coverage floor on `core` (checklist E8) is not enforced yet (see `known-issues.md`).

## What only the user can do

- Turn on "Allow auto-merge" in the repository settings (needed once for the auto-merge workflow). Renew the `AUTO_MERGE_TOKEN` secret before it expires (see ADR 5). Merge Dependabot pull requests by hand.
- Create the hosting account (once a host is chosen) and run login and deploy.
- Change repository settings (branch rules, Actions).

## How to keep this current

At the end of every branch, before opening the PR:

1. Update "Status" and "Last updated".
2. Tick off or reword the step you finished in "Next steps"; add steps you discovered.
3. Move answered questions out of "Open questions" into "Decisions already made" with a link to where they are recorded.
4. If a decision changed, add or supersede an ADR; do not rewrite history here.

The PR template asks whether this was done.
