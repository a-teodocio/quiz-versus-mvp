# Folder structure

Where things live, and the rules for adding more. `npm run check:structure` (part of `npm run check` and CI) enforces the parts a script can check. A new top-level folder or a new kind of file needs this document updated in the same change.

## Layout

Folders marked _planned_ do not exist yet and are created by the feature branch that needs them.

```
.
├── .claude/agents/            Subagent definitions (standards-reviewer, qa-tester)
├── .claude/settings.json      Project hooks: the pull request guard (scripts/pr-guard.mjs, ADR 16)
├── .github/                   CI and auto-merge workflows, Dependabot config, PR template
├── .husky/                    Git hooks (pre-commit, commit-msg)
├── content/                   FAKE quiz data only (see content/README.md)
│   ├── quizzes/courses.json   The course registry, as in the real app
│   ├── quizzes/<course>/      Quiz JSON in the real app's schema
│   └── images/<course>/       Generated placeholder images (scripts/make-content-images.mjs)
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
│   ├── incident-5b-merged-without-review.md  What happened when PR 31 merged unreviewed, and the controls chosen (ADR 16)
│   ├── folder-structure.md    This file
│   └── protocol.md            Every client/server message
├── e2e/                       Playwright end-to-end tests (planned). e2e/qa/ is written by the qa-tester from docs/qa-scenarios.md; the helpers and configuration around it are the author's
├── packages/
│   ├── protocol/              Message schemas and types, and the bodies of the HTTP routes
│   ├── core/                  Pure game logic
│   ├── quiz-validator/        Checks content/ against the real validator's rules (authoring tool)
│   ├── worker/                The game server: HTTP routes, WebSocket adapter, rooms in memory
│   └── web/                   Browser app: the forked quiz page (public/index.html with public/css/ and public/js/, SOURCE.md) and the Playwright tests that pin it; the versus client comes next
├── scripts/                   Repo tooling run from npm scripts (fixture and picture generators, the PNG writer they share, the QA server and test runners qa-server.mjs and qa-ws.mjs), the forked page's dev server (web-dev-server.mjs serves it over the fake content), the qa-tester guard (qa-guard.mjs) and the pull request guard (pr-guard.mjs), each with its tests
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

- Tests the qa-tester writes for a package live in `test/qa/` (today `packages/worker/test/qa/`, created by the first tester run); the author owns the rest of `test/`.
- Unit tests sit next to the code as `thing.test.ts`. Larger tests and fixtures go in `test/`.
- Group by feature (`room/`, `scoring/`, `quiz/`), not by kind (`utils/`, `helpers/`, `types/`). There is no `utils` or `common` folder.
- Fixtures copied from the real app live in `packages/<name>/test/fixtures/real-app/` (today `core` and `quiz-validator`) with a `SOURCE.md` recording the source commit and what was copied.
- Anything exported from `src/index.ts` is public API. Everything else is internal and must not be imported by another package.
- `core` and `protocol` list two entries in `exports`: the TypeScript source under the `development` condition, which Vitest and `tsc` use (`resolve.conditions` in `vitest.config.ts`, `customConditions` in `tsconfig.base.json`), and the built JavaScript in `dist/` by default, which plain Node uses. Plain Node cannot load the source: imports are spelled `.js` and the files are `.ts`. Run `npm run build` before running anything under `node`. A new package that another package runs under Node does the same.

## Naming

- Files and folders: `kebab-case`. Test files: `*.test.ts`. Docs: `kebab-case.md`. ADRs: `NNNN-short-title.md`.
- Packages: `@quiz-versus/<name>`.
- Branches: `feat/`, `fix/`, `chore/`, `docs/`.

## What never goes in the repo

- Real course content, questions, images or notes (public repo).
- Build output (`dist/`), caches (`*.tsbuildinfo`), coverage, logs, the QA server pid file, or local secrets (`.env`, `.dev.vars`). The `.gitignore` covers these.
- Scratch files, notes to self, or commented-out code. Use the branch, a PR description or `known-issues.md`. (The one exception is the owner's personal checklist, `docs/owner-checklist.md`: it is git-ignored, so it stays on one machine and is never committed.)

## Keeping it clean

- One home for each thing. Before adding a file, look for the folder that already owns that kind of thing.
- No new top-level entry without updating this file and the allow-list in `scripts/check-structure.mjs`.
- Empty or unused folders are removed.
- The reviewer checks structure under rules A12 and K5 in [review-checklist.md](review-checklist.md).
