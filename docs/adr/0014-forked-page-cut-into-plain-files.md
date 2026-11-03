# 14. The forked page is cut into plain stylesheets and scripts, not ES modules

Status: accepted (2026-11-02).

## Context

Roadmap step 5a asks for the forked quiz page (one 4,000 line file) to be split, with no change in behaviour, so that the versus client can be added next to it and not inside it. The 60 Playwright tests that pin the page are the acceptance test ([ADR 13](0013-playwright-for-browser-tests.md)).

Three facts shape the split:

- The page is written as one classic script. It has 203 top-level functions and 50 inline `onclick` handlers that call them by name, and the pin tests call some of those functions through `page.evaluate`. They all rely on the names being global.
- ES modules have their own scope (no globals unless each is attached to `window`), run in strict mode and load deferred. Converting the page would change code the tests pin and touch most of its 3,900 lines.
- No bundler is vetted. The usual ones (`esbuild`, `vite`) bring install scripts, which the dependency rules refuse ([dependency-vetting.md](../dependency-vetting.md)). How `protocol` (zod) reaches the browser is a real question, but it belongs to the first branch that needs it (5d, the lobby), not to a branch that is meant to change no behaviour.

## Decision

Cut the page into files that load as the plain scripts and stylesheets they already were:

- `public/css/*.css` (5 files) and `public/js/*.js` (15 files), each a run of whole lines of the original block, cut at its own section headers (a few at a top-level declaration). `public/index.html` keeps the markup and the small theme script that must run before the first paint, and loads the files with `<link>` and `<script src>` tags in the original order, with no `defer` and no `type="module"`.
- The cut is made by `scripts/make-web-fork.mjs` (`SPLIT`, `splitPage`) from the fork it already makes, so the generator keeps working: real page, then the 13 recorded edits, then the cut. The fork's SHA-256 in `SOURCE.md` is unchanged, because it is the hash of the page with its files put back in place of their tags.
- `packages/web/test/fork-source.test.ts` does that putting back with its own code (not the script's) and checks the hash. It also checks that every file in `css/` and `js/` is loaded exactly once, that no script is a module, and that the banned-dash and storage-key rules hold over the assembled text. "No change in behaviour" is therefore a byte check as well as a test run.
- The files are not formatted or linted (`.prettierignore`, the ESLint ignores): they are the real app's code, and reformatting one would break the hash.
- `scripts/web-dev-server.mjs` serves `/css/<name>.css` and `/js/<name>.js` from next to `index.html`. The name pattern allows no dot or slash. The real app serves one file, so this is a fidelity row.

Rules for the files, because separate scripts are not hoisted across files:

1. The files load in the order `SPLIT` lists them. Code that runs while a file loads (a `const`, an event listener registered at the top level, a call) may use only what the same file or an earlier one declares. Functions called later, from a handler or a timer, may be anywhere.
2. Everything that starts the page (`initUI()` and the calls after it, the listeners that need the whole page) is in the last file, `boot.js`.
3. A file added later goes in `SPLIT` too, or the hash test fails.

## Consequences

- The page behaves as before: the 60 pin tests pass unchanged, and the hash proves the text is the same.
- The code is not yet grouped by concern nor converted to modules or TypeScript. That change is made where the versus client needs it, with the files and the tests as the safety net. From that point the hash test and `make-web-fork.mjs` stop describing the page, so they are retired in the same branch, with a note in `SOURCE.md`.
- New versus code does not go in these files. It is written as its own (linted, tested, typed) code and loaded beside them. The first such branch (5d) decides how it is built and how `protocol` reaches the browser, and records that in its own ADR.
- Remaking the fork writes `index.html` and the 20 files. Anyone refreshing the fork from a changed real page may also have to move a cut (the script refuses when a cut no longer matches exactly one line).
- A cut file is not a module, so a name in one file can be used from any other. That is the property the pin tests and the inline handlers need now, and the one a later conversion will have to replace.
