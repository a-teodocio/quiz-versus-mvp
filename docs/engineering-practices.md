# Engineering practices

The data in this repo is mock; the code is not. Everything here is written so it can be maintained and scaled, and so the real app can adopt it. These rules apply to every change.

## Architecture

- **Layers, one-way dependencies.** `core` (pure game logic) <- `protocol` (message shapes) <- adapters (`worker`, `web`). Inner layers never import outer ones. See [architecture.md](architecture.md).
- **Core has no I/O.** No network, clock, randomness or storage inside `core`: they come in as injected interfaces (`Clock`, `Random`, `QuizRepository`). This keeps the core deterministic and testable without Cloudflare or a browser.
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
- Merge by pull request only, after CI is green. CI runs lint, format check, typecheck, tests and build on every PR.
- `main` should be protected (PR required, `check` status required, applies to admins too). Approvals required: 0, because there is one maintainer.

## Testing

Test pyramid, from cheap to expensive:

1. **Unit (Vitest):** `core` and `protocol`. Fast, deterministic, no I/O. Table-driven for scoring, shuffle and state transitions.
2. **Integration:** the real Worker and Durable Object running locally with several simulated WebSocket clients. Covers join, start, answer, timeout, reconnect, player and host leaving.
3. **End to end (Playwright):** three browsers play a full game against the local stack.
4. **Contract and parity:** mock quiz data passes the same validation rules as the real app's validator. Shuffle and key logic is compared against fixtures copied from the real app (with the source commit recorded), never read from outside this repo.

Rules: a bug fix starts with a failing test. Tests do not depend on wall-clock time or real randomness. CI enforces a coverage threshold on `core`.

## Documentation

- `README.md`: what it is, quickstart, commands.
- `docs/architecture.md`: layers, diagram, dependency rule.
- `docs/protocol.md`: every message, its fields and when it is sent.
- `docs/adr/`: one short Architecture Decision Record per significant decision (context, decision, consequences). Never edit an accepted ADR; supersede it.
- `docs/fidelity.md`: every place the mock differs from the real app, and why.
- `LESSONS.md` (at the end): what worked, what to change, port checklist.
- Public functions and exported types carry short doc comments. Docs change in the same PR as the behaviour.

## Review

Major changes are reviewed against [review-checklist.md](review-checklist.md) by the `standards-reviewer` subagent before the pull request is opened. The author verifies each finding, fixes the real ones and records rejected ones with a reason. Rules a tool can enforce (complexity, size, layer imports, `TODO` comments, impure globals in `core`) are in ESLint and fail the build; the reviewer covers the judgement-based rules.

## Dependencies and security

- Every third-party package is vetted before use and on every CI run: see [dependency-vetting.md](dependency-vetting.md) (release-age cooldown, audit, signatures, install scripts).
- Lockfile committed; installs in CI use `npm ci --ignore-scripts`. Node version pinned in `.nvmrc` and `engines`.
- Add a dependency only with a reason; prefer the platform. Record notable choices in an ADR.
- No secrets in the repo. Local secrets go in `.dev.vars` (git-ignored).
- Known audit findings are tracked in `docs/known-issues.md` until fixed.
