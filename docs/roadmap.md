# Roadmap and status

The continuity file. A new session reads this after `CLAUDE.md` to learn where the project is and what comes next. It is updated at the end of every branch (see "How to keep this current").

Last updated: 2026-11-02 (after `feat/core` and the qa-tester guard messages, at the start of `feat/content`)

## Goal

Trial a live multiplayer (versus) mode for the user's MLS quiz app on a small, fake-content mock: invite a friend by link, join a room of 2 or more players (a game needs two connected players to start; solo play is the real app's own mode), answer the same random questions, and compete for the highest score. The mock must stay true to the real app's behaviour, and be built to production standards, so the lessons and much of the code can move to the real app. The experiment ends with `LESSONS.md`.

The real app (a local Python server plus one large `index.html`) lives in the user's vault, folder `knowledge training`. It is read-only reference from this repo. Its question schema, shuffle, image-groups, typed answers and progress keys are what the mock must reproduce.

## Decisions already made

| Decision                                                                                                                                                                                                                   | Where recorded                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Cloudflare Pages, Workers and one Durable Object per room; server-authoritative scoring                                                                                                                                    | `adr/0002-cloudflare-durable-objects-for-rooms.md` |
| TypeScript, npm workspaces, layer rules enforced by ESLint                                                                                                                                                                 | `adr/0003-typescript-and-workspaces.md`            |
| Fake content only; the repo is public                                                                                                                                                                                      | `CLAUDE.md`                                        |
| Fork the real `index.html` verbatim first, pin its behaviour with tests, then split it                                                                                                                                     | this file, step 5                                  |
| Hold TypeScript at 6.x until `typescript-eslint` supports 7                                                                                                                                                                | `known-issues.md`, `dependency-vetting.md`         |
| Review by the `standards-reviewer` subagent before major PRs, not a required CI check yet                                                                                                                                  | `CLAUDE.md`, `review-checklist.md`                 |
| zod validates every message at the boundary, inside `packages/protocol` only                                                                                                                                               | `adr/0004-zod-for-boundary-validation.md`          |
| Wire protocol (version 3): strict JSON messages, `question` never carries the answer                                                                                                                                       | `protocol.md`                                      |
| Versus needs 2 connected players to start (protocol 3, `NOT_ENOUGH_PLAYERS`); solo play is the real app's own mode                                                                                                         | `adr/0007-core-state-machine.md`, `protocol.md`    |
| The qa-tester writes end-user tests and judges functionality, usability and accessibility (WCAG 2.2 AA); a hook holds it to an allowlist                                                                                   | `adr/0008-qa-tester-sandbox.md`, `qa-scenarios.md` |
| The keys 1 to 4 work only while focus is in the question area and can be switched off; a warning shows when 10 seconds remain                                                                                              | `adr/0009-player-interface-rules.md`               |
| Core state machine: pure `step(state, event)`, game prepared before `start`, time as data, answers held until the reveal, item keys and image aliases issued by core, host hand-over rules                                 | `adr/0007-core-state-machine.md`                   |
| Versus game rules: 1 point per correct answer (times a multiplier that is 1 for now), close when all connected players have answered, late joining allowed, tie-break questions for first place, equal scores share a rank | `adr/0006-versus-game-rules.md`                    |
| Players per room: 8 for now (provisional, one constant: `MAX_PLAYERS_PER_ROOM`)                                                                                                                                            | `protocol.md`, `packages/protocol/src/limits.ts`   |
| Versus asks for typed text only where the real app can auto-check it; the rest stay multiple choice                                                                                                                        | `fidelity.md`                                      |
| The owner's PRs merge themselves once `check` passes; a draft is held back                                                                                                                                                 | `adr/0005-auto-merge-owner-pull-requests.md`       |

## Status

| Area                                                                      | State                                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Tooling: TypeScript, ESLint layer rules, Prettier, hooks, Vitest          | Done                                                           |
| CI: lint, structure, format, typecheck, test, build, audit, signatures    | Done, `check` is a required status                             |
| Branch protection on `main`                                               | Done: PR required, `check` required, no force push or deletion |
| Docs: practices, architecture, checklist, vetting, structure, ADRs 1 to 7 | Done                                                           |
| `standards-reviewer` subagent                                             | Done, run on `feat/core` (see its pull request)                |
| Dependabot                                                                | Weekly, 14-day cooldown, TypeScript major bumps ignored        |
| `packages/protocol`: schemas, codec, tests, `docs/protocol.md`            | Done and merged (protocol version 3)                           |
| `packages/core`: ports, shuffle, typed answers, scoring, state machine    | Done and merged                                                |
| Application code (`worker`, `web`)                                        | **Not started**                                                |

## Next steps, in order

Each step is its own `feat/` branch, merged by pull request. Run `npm run check` and the standards-reviewer before opening the PR for steps 1, 2, 4 and 5. From step 4 (`feat/worker`) the `qa-tester` also plays the scenarios in [qa-scenarios.md](qa-scenarios.md) that the step makes runnable (see `CLAUDE.md`).

1. ~~**`feat/protocol`**~~: done. zod schemas, error codes, protocol version, decoders and encoders, `docs/protocol.md`, ADR 4. ~~**`feat/protocol-game-rules`**~~: done. Protocol v2 for the game rules in ADR 6 (tie-break, late joining).
2. ~~**`feat/core`**~~: done. `packages/core`. Ports `Clock`, `Random`, `QuizRepository`, `Logger`. Room state machine (LOBBY, QUESTION, REVEAL, RESULTS, with a tie-break inside it) as a pure function of state and event, returning new state and effects, implementing the rules in ADR 6. Scoring through a `ScoringRule` (1 point times a multiplier that is 1 for now). `prepareGame` loads through `QuizRepository` and sets aside the tie-break reserve (ADR 7). Shuffle that maps `correct` exactly as the real app does, drawing from the injected `Random`. Unit tests, plus parity fixtures copied from the real app into `packages/core/test/fixtures/real-app/` with a `SOURCE.md` recording the source commit.
3. **`feat/content`**: `content/quizzes/<course>/` and `content/images/<course>/` with fake notes in the real schema: text, image, image-group with parts, typed answers, awkward whitespace, options that shuffle to the same position. A TypeScript port of the real validator's rules checks them.
4. **`feat/worker`**: `packages/worker`. Worker and Durable Object, WebSocket adapter (text frames only), quiz loading, alarms as the `Clock`, enforce the protocol limits (message size and name length are already in the decoders; players per room and message rate are not), origin check, unguessable room IDs, opaque image URLs that do not spell out the answer, answers withheld until REVEAL, and `room` snapshots carrying no correctness signal (scores and `tiebreak` change only at a reveal), with a test. Core already issues the item keys and image aliases and re-sends the last `reveal` (ADR 7); the worker serves `/images/<alias>` from `GamePlan.images`, calls `prepareGame`, supplies secure ids, tokens and `Random`, ignores a `disconnect` from a replaced connection, and owns the idle-room time limit. Integration tests with simulated WebSocket clients: join, start, answer, timeout, reconnect, player leaves, host leaves.
5. **`feat/web-fork`, then `feat/web-versus`**: `packages/web`. First fork the real `index.html` verbatim and pin its behaviour with Playwright tests, then split it into modules. Then add the lobby and versus UI. Keep game rules out of view code. Escape all player-supplied text. Apply the key and warning rules of ADR 9 after the verbatim fork is pinned by tests, each with its fidelity row.
6. **`feat/e2e`**: `e2e/`. Three browsers play a full game against the local stack. The author owns the helpers and the Playwright configuration; the qa-tester owns `e2e/qa/` (see ADR 8). Add `e2e/` to ESLint and typecheck, and vet Playwright and axe.
7. **Deploy**: Cloudflare Pages and Worker. Gate: no open P1 in [parked-product-questions.md](parked-product-questions.md) and every core question answered; review the P2 ones before promoting. The user creates the account and runs login and deploy; Claude supplies the exact commands.
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

- Cloudflare free-tier limits must be re-checked before relying on them.
- No core product questions are waiting. The parked questions, ranked P1 to P3, are in [parked-product-questions.md](parked-product-questions.md).
- The coverage floor on `core` (checklist E8) is not enforced yet (see `known-issues.md`).

## What only the user can do

- Turn on "Allow auto-merge" in the repository settings (needed once for the auto-merge workflow). Renew the `AUTO_MERGE_TOKEN` secret before it expires (see ADR 5). Merge Dependabot pull requests by hand.
- Create the Cloudflare account and run login and deploy.
- Change repository settings (branch rules, Actions).

## How to keep this current

At the end of every branch, before opening the PR:

1. Update "Status" and "Last updated".
2. Tick off or reword the step you finished in "Next steps"; add steps you discovered.
3. Move answered questions out of "Open questions" into "Decisions already made" with a link to where they are recorded.
4. If a decision changed, add or supersede an ADR; do not rewrite history here.

The PR template asks whether this was done.
