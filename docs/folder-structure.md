# Folder structure

Where things live, and the rules for adding more. `npm run check:structure` (part of `npm run check` and CI) enforces the parts a script can check. A new top-level folder or a new kind of file needs this document updated in the same change.

## Layout

Folders marked _planned_ do not exist yet and are created by the feature branch that needs them.

```
.
├── .claude/agents/            Subagent definitions (standards-reviewer, qa-tester)
├── .github/                   CI and auto-merge workflows, Dependabot config, PR template
├── .husky/                    Git hooks (pre-commit, commit-msg)
├── content/                   FAKE quiz data only (planned)
│   ├── quizzes/<course>/      Quiz JSON in the real app's schema
│   └── images/<course>/       Generated placeholder images
├── docs/
│   ├── adr/                   Architecture decision records, numbered
│   ├── roadmap.md             Status, decisions, next steps (read first in a new session)
│   ├── architecture.md        Packages, layers, state machine
│   ├── engineering-practices.md
│   ├── review-checklist.md
│   ├── qa-scenarios.md        What the qa-tester writes tests for and walks as personas
│   ├── parked-product-questions.md  Questions outside the core game, ranked P1 to P3
│   ├── dependency-vetting.md
│   ├── fidelity.md            Where the mock differs from the real app
│   ├── known-issues.md
│   ├── folder-structure.md    This file
│   └── protocol.md            Every client/server message
├── e2e/                       Playwright end-to-end tests (planned). e2e/qa/ is written by the qa-tester from docs/qa-scenarios.md; the helpers and configuration around it are the author's
├── packages/
│   ├── protocol/              Message schemas and types
│   ├── core/                  Pure game logic
│   ├── worker/                Cloudflare Worker and Durable Object (planned)
│   └── web/                   Browser app (planned)
├── scripts/                   Repo tooling run from npm scripts, and the qa-tester guard (qa-guard.mjs) with its tests
├── CLAUDE.md                  Working rules for Claude
├── LESSONS.md                 What the experiment taught us (written at the end)
├── README.md
└── config files at the root   package.json, tsconfig*.json, eslint.config.js,
                               vitest.config.ts, commitlint.config.js, .prettierrc.json,
                               .editorconfig, .gitattributes, .gitignore, .nvmrc
```

## Inside a package

Every package has the same shape, so any package is easy to navigate:

```
packages/<name>/
├── package.json        name @quiz-versus/<name>, scripts, dependencies
├── tsconfig.json       extends ../../tsconfig.base.json
├── README.md           purpose, public API, what it may and may not depend on
├── src/
│   ├── index.ts        the ONLY entry point other packages may import
│   └── <feature>/      code grouped by feature, not by technical kind
└── test/               tests that need fixtures or cross several modules
```

- Tests the qa-tester writes for a package live in `test/qa/` (today `packages/worker/test/qa/`, planned); the author owns the rest of `test/`.
- Unit tests sit next to the code as `thing.test.ts`. Larger tests and fixtures go in `test/`.
- Group by feature (`room/`, `scoring/`, `quiz/`), not by kind (`utils/`, `helpers/`, `types/`). There is no `utils` or `common` folder.
- Fixtures copied from the real app live in `packages/core/test/fixtures/real-app/` with a `SOURCE.md` recording the source commit and what was copied.
- Anything exported from `src/index.ts` is public API. Everything else is internal and must not be imported by another package.

## Naming

- Files and folders: `kebab-case`. Test files: `*.test.ts`. Docs: `kebab-case.md`. ADRs: `NNNN-short-title.md`.
- Packages: `@quiz-versus/<name>`.
- Branches: `feat/`, `fix/`, `chore/`, `docs/`.

## What never goes in the repo

- Real course content, questions, images or notes (public repo).
- Build output (`dist/`), caches (`*.tsbuildinfo`, `.wrangler/`), coverage, logs, or local secrets (`.dev.vars`). The `.gitignore` covers these.
- Scratch files, notes to self, or commented-out code. Use the branch, a PR description or `known-issues.md`. (The one exception is the owner's personal checklist, `docs/owner-checklist.md`: it is git-ignored, so it stays on one machine and is never committed.)

## Keeping it clean

- One home for each thing. Before adding a file, look for the folder that already owns that kind of thing.
- No new top-level entry without updating this file and the allow-list in `scripts/check-structure.mjs`.
- Empty or unused folders are removed.
- The reviewer checks structure under rules A12 and K5 in [review-checklist.md](review-checklist.md).
