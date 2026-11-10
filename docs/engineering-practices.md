# Engineering practices

The data in this repo is mock; the code is not. Everything here is written so it can be maintained and scaled, and so the real app can adopt it. These rules apply to every change.

## Architecture

- **Layers, one-way dependencies.** `core` (pure game logic) <- `protocol` (message shapes) <- adapters (`worker`, `web`). Inner layers never import outer ones. See [architecture.md](architecture.md).
- **Core has no I/O.** No network, clock, randomness or storage inside `core`: they come in as injected interfaces (`Clock`, `Random`, `QuizRepository`). This keeps the core deterministic and testable without a server or a browser.
- **Depend on interfaces, not implementations.** Adapters implement interfaces owned by the layer that uses them.
- **One protocol, validated at the boundary.** All client/server messages are defined once in `protocol` and parsed with a schema (zod) wherever they enter the system. Nothing past the boundary handles unvalidated data.
- **Explicit state machine** for a game room: lobby, question, reveal, results. Illegal transitions are unrepresentable or rejected, never silently ignored.
- **No hidden globals.** No module-level mutable state; pass dependencies in.

The dependency rule is enforced by ESLint (`eslint.config.js`), not just described here.

## Code style

- TypeScript, `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`; use `unknown` and narrow.
- ESLint (typescript-eslint strict, type-checked) and Prettier (`.prettierrc.json`, LF, 100 columns). The tools decide formatting; do not argue with them in review.
- Small modules and functions with one reason to change. Names say what a thing is or does; comments say why, not what.
- No `console` in source (use an injected logger). `eqeqeq`. Type-only imports use `import type`.
- Prefer immutable data and pure functions. Errors are typed results or specific error classes, never bare strings.
- No em dashes in any text, code comments or docs.

## Git workflow

- `main` is always releasable. Never commit to it directly.
- Branches: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`. Short-lived; delete after merge.
- Conventional Commits (`feat(core): add scoring`), enforced by commitlint in a `commit-msg` hook. Pre-commit runs lint-staged. Never skip hooks.
- One concern per pull request, kept small. The PR template lists what to confirm.
- Merge by pull request only, after CI is green. Every pull request is opened as a draft; the owner marks it ready, and a ready pull request auto-merges once `check` passes ([ADR 5](adr/0005-auto-merge-owner-pull-requests.md), [ADR 16](adr/0016-the-owner-releases-pull-requests.md)). CI runs lint, format check, typecheck, tests and build on every PR.
- `main` should be protected (PR required, `check` status required, applies to admins too). Approvals required: 0, because there is one maintainer.

## Testing

Test pyramid, from cheap to expensive:

1. **Unit (Vitest):** `core` and `protocol`. Fast, deterministic, no I/O. Table-driven for scoring, shuffle and state transitions.
2. **Integration:** the real server running locally on a free port with several real WebSocket clients, inside `npm run check`. Covers join, start, answer, timeout, reconnect, player and host leaving.
3. **End to end (Playwright):** three browsers play a full game against the local stack.
4. **Contract and parity:** mock quiz data passes the same validation rules as the real app's validator. Shuffle and key logic is compared against fixtures copied from the real app (with the source commit recorded), never read from outside this repo.

Rules: a bug fix starts with a failing test. Tests do not depend on wall-clock time or real randomness. CI enforces a coverage threshold on `core`.

## Documentation

- `README.md`: what it is, quickstart, commands.
- `docs/roadmap.md`: status, decisions and next steps; updated at the end of every branch so any session can resume.
- `docs/architecture.md`: layers, diagram, dependency rule.
- `docs/protocol.md`: every message, its fields and when it is sent.
- `docs/adr/`: one short Architecture Decision Record per significant decision (context, decision, consequences). Never edit an accepted ADR; supersede it.
- `docs/fidelity.md`: every place the mock differs from the real app, and why.
- `LESSONS.md` (at the end): what worked, what to change, port checklist.
- Public functions and exported types carry short doc comments. Docs change in the same PR as the behaviour.

## Review

Every pull request is reviewed against [review-checklist.md](review-checklist.md) by the `standards-reviewer` subagent before the owner releases it, except a docs-only one or one the owner exempts ([ADR 16](adr/0016-the-owner-releases-pull-requests.md) defines both). The author verifies each finding, fixes the real ones, records rejected ones with a reason, and posts the result as a comment on the pull request. Rules a tool can enforce (complexity, size, layer imports, `TODO` comments, impure globals in `core`) are in ESLint and fail the build; the reviewer covers the judgement-based rules.

**Second look after fixes (mandatory).** Fixes made in response to a review are reviewed again by the same reviewer (or, if it cannot be resumed, a fresh one given the earlier review comments) before the pull request is merged, and again after any further fixes, until it reports nothing open. Fixes are where new rules and contradictions slip in unreviewed. The pull request stays a draft until the final review is finished, and one the owner has already released goes back to draft before it is changed. The description's Review block names the commit the final review covered, which is the head of the branch.

**Accessibility and usability.** The player interface meets WCAG 2.2 level AA and the usual usability heuristics (clear status, plain error messages, no dead ends, consistent words and controls). This is a requirement, not polish: [qa-scenarios.md](qa-scenarios.md) lists what is checked, and the accessibility checks run as automated tests on every screen state once the web client exists.

**Test as a player.** For changes that make the app run or change how it behaves (from `feat/worker`), the `qa-tester` subagent writes end-user tests from the scenarios in [qa-scenarios.md](qa-scenarios.md), has the test frameworks run them, and plays the app itself as a set of personas (a friend on a phone, a keyboard-only player, a screen-reader player, a low-vision player and others). It judges what a player sees and is told, which the code review cannot, and reports findings with the requirement, usability principle or WCAG criterion each rests on. The same rules apply as for the reviewer: the author verifies each finding, fixes the real ones, records rejected ones with a reason, reads the tests it wrote like any other code, and the same tester looks again at the fixes before the pull request is marked ready. The tester is held by a hook to a short allowlist of commands, to its own test folders and to reading inside the repo ([ADR 8](adr/0008-qa-tester-sandbox.md), including what it cannot see), installs nothing and uses fake content. Some things need a person (real screen readers, real devices, real players): the tester lists them and they are checked before real use.

## Dependencies and security

- Every third-party package is vetted before use and on every CI run: see [dependency-vetting.md](dependency-vetting.md) (release-age cooldown, audit, signatures, install scripts).
- Lockfile committed; installs in CI use `npm ci --ignore-scripts`. Node version pinned in `.nvmrc` and `engines`.
- Add a dependency only with a reason; prefer the platform. Record notable choices in an ADR.
- No secrets in the repo. Local secrets go in a git-ignored file or the environment (`.env` and `.dev.vars` are ignored by the QA guard and must never be committed).
- Known audit findings are tracked in `docs/known-issues.md` until fixed.
