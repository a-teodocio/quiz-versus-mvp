# The forked quiz page

`public/index.html` and the files it loads are the real quiz app's page (one file of HTML, CSS and JavaScript in the real app), copied so the versus mode can be built on the app's real behaviour. It is roadmap step 5: copy it as it is, pin its behaviour with tests, cut it into files (5a, [ADR 14](../../docs/adr/0014-forked-page-cut-into-plain-files.md)), then change it on purpose (5b onwards, [ADR 15](../../docs/adr/0015-the-forked-page-is-edited-by-hand.md)). Since 5b the files are **edited by hand**; they are no longer generated.

- **Source:** the real app's `index.html` (not in this repo), last changed in its repository at commit `5146c4a61e217d2c8f8d32d4361e3b93698baf52` (2026-10-31), version 1.55.0 of its server and page.
- **Real file SHA-256:** `b5a98270bd85726cd177f1d55bc49729a0a401164d2a5979ecd47cb3e4a24a54` (4,019 lines, line endings as LF).
- **Fork SHA-256 (at the fork, before any change of behaviour):** `25bf90dadbbf1cef644a0bbccc242e93b64a7f39f0c41b3203daec730541f0c4`. This is the hash of the one-file page that the 13 edits below made from the real file, which is also the page the 20 files held when they were first cut from it (ADR 14). It is a record, no longer a test: the page has changed since (see "Changes since the fork").
- **How it was made:** by a script that checked the real file's hash, applied the edits below (each had to match exactly as often as listed) and cut the result into files. The script and its tests were removed in 5b (ADR 15). They are at `aea30d5` in the git history (`scripts/make-web-fork.mjs`), where `node scripts/make-web-fork.mjs <path to the real index.html>` still reproduces the fork above from the real file.
- **Not formatted or linted:** `.prettierignore` and the ESLint ignores leave the files in `public/css/` and `public/js/` (and `index.html`) alone, so a change to them is a change of text and nothing else.
- **Load order:** the scripts are plain scripts, so the order in `index.html` is the original order and matters. Code that runs while a file loads may use only what that file or an earlier one declares; everything that starts the page is in `js/boot.js`, the last file.

## What differs from the real page

The repo is public and bans em dashes, so these 13 lines differ. Nothing else does.

| Where (real page)    | Real                                                 | Fork                                      | Why                                 |
| -------------------- | ---------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| Typed near miss      | `Almost` + em dash + `check the spelling`            | `Almost: check the spelling`              | No em dashes                        |
| Few questions toast  | `distribution` + em dash + `adjust settings`         | `distribution: adjust settings for more.` | No em dashes                        |
| Resume failure toast | `that session` + em dash + `are they still`          | `that session: are they still`            | No em dashes                        |
| Answer feedback (x4) | `<strong>answer</strong>` + em dash + `text`         | `<strong>answer</strong>: text`           | No em dashes                        |
| Results note (x3)    | `Time’s up`, `Ended early`, `N unanswered` + em dash | the same words followed by a colon        | No em dashes                        |
| Comments (x3)        | name a person in three version notes                 | the name removed                          | Public repo, no personal names      |
| Comment (x1)         | a real chapter title as an example                   | `Chapter 12 - Example Topic: Terminology` | Public repo, no real course content |

The em dash edits change what a player reads, so each is a row in [fidelity.md](../../docs/fidelity.md).

## What is kept as it is

- The page loads the Inter font from Google Fonts (`fonts.googleapis.com`). The tests block that request, so they never reach the network; the page falls back to its system fonts.
- The page builds most of its markup from quiz text with `innerHTML`, so quiz files may contain markup. That suits files the owner writes. It is not safe for text that other players type: the versus client escapes every player-supplied string (roadmap step 5).
- It talks to the real app's read-only API (`/api/list`, `/api/courses`, `/api/quiz`, `/image`). `scripts/web-dev-server.mjs` serves that API over the fake content.

## Changes since the fork

Each is a deliberate change of behaviour with a test and a row in [fidelity.md](../../docs/fidelity.md). A pin test that changes with it says so.

| Branch                       | Where                                                                                        | Real                                                                                                                                | Now                                                                                                           | Why                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `fix/web-known-defects` (5b) | `js/question.js`: `handleImgError`, `clearImgNotice`, and the two places a question is drawn | A picture that fails to load replaces the `<img id="questionImage">` element with a notice, so every later picture question throws  | The element stays, hidden, with the notice beside it; the next question draws as usual                        | One missing picture ruined the rest of the quiz |
| `fix/web-known-defects` (5b) | `js/typed.js`: `answerLabel`                                                                 | In exam mode with Answer by Type, an answer that needs marking by hand is multiple choice under the label "answer too long to type" | The label says "cannot be typed in exam mode" for that case; "answer too long to type" stays for long answers | The player was given a wrong reason             |

## Refreshing from the real app

There is no script any more. If the real page changes and the change is wanted: diff the real file against the page as it was at the fork (`git show 7d17fec:packages/web/public/index.html` is the one-file fork before the cut; the same text is the 20 files as they were at `aea30d5`), port the change by hand into the files, add or change a test, and add a row here and in `fidelity.md`. A pin test that fails after a change is a behaviour that changed.
