# 15. The forked page is edited by hand; the fork script and hash test are retired

Status: accepted (2026-11-02). Supersedes the generator and hash parts of [ADR 13](0013-playwright-for-browser-tests.md) ("the fork is generated, not edited") and [ADR 14](0014-forked-page-cut-into-plain-files.md) (`SPLIT`, `splitPage`, the hash of the assembled page), as ADR 14 planned.

## Context

Until now the forked page was a copy of the real app's page, made by `scripts/make-web-fork.mjs` from the real file (hash checked, 13 recorded edits, then the cut into files), and a unit test checked the SHA-256 of the assembled text. That made "the fork changed nothing but what is listed" a fact, which is what the pin tests needed while the fork was copied and then cut.

Roadmap 5b fixes two defects the real page has (a picture that fails to load breaks every later picture question; a wrong reason in the label of an exam-mode question). A fix is a change to the text, so the generated output can no longer be the source of truth: either the script gains a list of fixes on top of its edits, or the files become the source.

## Decision

The files in `packages/web/public/` (`index.html`, `css/`, `js/`) are the source and are edited by hand.

- `scripts/make-web-fork.mjs`, its test and the `npm run fork:web` script are removed. They stay in git history (at `aea30d5`), where they still reproduce the fork from the real file.
- The hash test is removed from `test/fork-source.test.ts`. The checks that do not depend on the hash stay: every file in `css/` and `js/` is loaded once and nothing else is in `public/`, the scripts are plain scripts, LF line endings, no banned dash, the storage keys match, and the page is still the real app's (title, API calls).
- The behaviour is pinned by the Playwright tests. Every change of behaviour comes with a test (first failing) and a row in `fidelity.md`.
- `packages/web/SOURCE.md` keeps the real file's source commit and hash and the fork's hash as records, lists the 13 edits made at the fork, and gets a table "Changes since the fork" that every later change adds a row to.
- Lint and format still ignore the files (`.prettierignore`, ESLint): a change shows as a change of text, not of formatting. Code written for the versus client is not under this rule.

## Consequences

- A change in the real app is ported by hand: diff it against the fork (kept in git history), port it, test it, record it. That is more work than rerunning a script, and it is wanted: the versus page will diverge from the real one anyway.
- Nothing proves any more that the page is still the real one except the pin tests. They are the guard, so a changed pin test is a decision to record in `SOURCE.md` and `fidelity.md`.
- There is no private text left in tooling: the script held patterns that found four private pieces without spelling them; with the script gone, no file in the repo needs to describe what was removed.
- The files are still plain scripts sharing global names (ADR 14). Grouping them by concern, ES modules or TypeScript are decided in the branch that needs them (5d).
