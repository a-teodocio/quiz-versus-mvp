# The forked quiz page

`public/index.html` and the files it loads are the real quiz app's page (one file of HTML, CSS and JavaScript in the real app), copied so the versus mode can be built on the app's real behaviour. It is roadmap step 5: copy it as it is, pin its behaviour with tests, then cut it into files (5a, [ADR 14](../../docs/adr/0014-forked-page-cut-into-plain-files.md)). The cut changes no text: the 5 stylesheets in `public/css/` and the 15 scripts in `public/js/` are runs of whole lines of the original block, loaded in the original order as plain scripts.

- **Source:** the real app's `index.html` (not in this repo), last changed in its repository at commit `5146c4a61e217d2c8f8d32d4361e3b93698baf52` (2026-10-31), version 1.55.0 of its server and page.
- **Real file SHA-256:** `b5a98270bd85726cd177f1d55bc49729a0a401164d2a5979ecd47cb3e4a24a54` (4,019 lines, line endings as LF).
- **Fork SHA-256:** `25bf90dadbbf1cef644a0bbccc242e93b64a7f39f0c41b3203daec730541f0c4`. This is the hash of the page with each file put back in place of its tag, the one-file page. `test/fork-source.test.ts` does that putting back with its own code and fails when the result stops matching this line, so any change to the page or its files is a visible, deliberate edit of this file.
- **How it was made:** `node scripts/make-web-fork.mjs <path to the real index.html>`. The script reads the real file, refuses it if its SHA-256 is not the one above, applies the edits below (each must match exactly as often as listed), cuts the result into files at the section headers listed in `SPLIT` (each cut must match exactly one line) and writes `public/index.html`, `public/css/` and `public/js/`. Nothing else is changed.
- **Not formatted or linted:** `.prettierignore` and the ESLint ignores leave the page and its files alone, so the difference from the real file stays these edits and nothing else.
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

## Refreshing

If the real page changes: run the script on the new file (it will refuse), read the real diff, update the hash, the edits and, if the script refuses a cut, the `SPLIT` cuts in `scripts/make-web-fork.mjs`, run it, then update the commit and both hashes here and run `npm run check` and `npm run test:web`. A pinned test that fails is a behaviour the real app changed.
