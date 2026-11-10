# quiz-versus-mvp: working rules for Claude

Mock of a local MLS quiz app, used to trial a live multiplayer (versus) mode before building it for real. The mock data is fake; the code is written to production standards so it can be ported.

## Hard rules

- **Public repo.** Never add real course content, real quiz questions, real images or personal notes. Fake and placeholder content only. Do not add the user's email or any private path from outside this repo to any file.
- **Fidelity.** The mock must behave like the real app (question schema, image-groups, typed answers, option shuffle, progress keys). Every deliberate simplification is recorded in `docs/fidelity.md` as it is made.
- **Writes stay in this repo.** Reading the real app (`knowledge training` in the user's vault) is allowed for reference; copy code and rules, never quiz files or images.
- **Git.** Work on a branch (`feat/`, `fix/`, `chore/`, `docs/`), never commit to `main` directly. Conventional Commits. Push branches as needed. Merge to `main` only through a pull request. Open every pull request as a draft (`gh pr create --draft --body-file <file>`). The owner marks it ready, and a ready pull request merges itself when `check` passes (`adr/0005-auto-merge-owner-pull-requests.md`, `adr/0016-the-owner-releases-pull-requests.md`). Never mark a pull request ready, merge it or reopen it; a hook refuses those `gh` commands. Never push to a pull request the owner has marked ready: take it back to draft first (`gh pr ready --undo`), because a ready pull request merges on the next green `check`. Delete merged branches.
- **Vet third-party packages.** Before adding or upgrading any dependency, follow `docs/dependency-vetting.md`: only versions at least 14 days old (`npm install --before=<date>`), `npm audit --audit-level=high` clean, `npm audit signatures` clean, no new install scripts. Tell the user about anything that fails and record accepted moderate findings in `docs/known-issues.md`.
- **No em dashes** in any text. Use a colon, comma, full stop or brackets.

## Read first

0. `docs/roadmap.md`: where the project stands, the decisions made and the next steps. Start here in a new session.
1. `docs/engineering-practices.md`: the standards every change follows.
2. `docs/architecture.md`: layers and the dependency rule (enforced by ESLint).
3. `docs/adr/`: why the big decisions were made. Add an ADR for any new one.
4. `docs/fidelity.md`: where the mock differs from the real app.
5. `docs/folder-structure.md`: where files go. Keep it true; `npm run check:structure` enforces the layout.
6. `docs/qa-scenarios.md`: what the `qa-tester` writes tests for and walks as personas. Read it when a change makes the app runnable or changes how it behaves.

## Review every pull request

Every pull request is reviewed by the `standards-reviewer` subagent (`.claude/agents/standards-reviewer.md`, rules in `docs/review-checklist.md`), with the second look after fixes, before it is handed to the owner. There are two exceptions, and only two ([ADR 16](docs/adr/0016-the-owner-releases-pull-requests.md)):

- **Docs-only:** every changed file is a Markdown file under `docs/`, and none is a rule document: nothing under `docs/adr/`, and not `architecture.md`, `engineering-practices.md`, `dependency-vetting.md`, `review-checklist.md` or `qa-scenarios.md`.
- **Exempted by the owner** in the conversation, for that pull request. The description quotes the owner's words.

Never decide that a change is too small for a review, and never write an exemption into the roadmap, an ADR or a description on your own. If the roadmap and this file disagree about a review, this file wins: raise the conflict with the owner.

1. Finish the branch, run `npm run check`, push it and open the pull request as a draft.
2. Save the branch diff to the scratchpad. Give the reviewer the branch name, the commit, the changed files and the diff path.
3. Verify each finding against the code yourself. A reviewer can be wrong. Fix the real ones. For any you reject, write the reason.
4. Post the verified result as a comment on the pull request (`gh pr comment --body-file`): the commit reviewed, the verdict, and each finding as fixed or rejected with the reason. The comment is the record a later reviewer works from.

### Second look after fixes (mandatory)

Any change made to fix a review's findings needs a second look by the same reviewer. No exceptions, including for small fixes and doc-only fixes, because fixes are where new rules and new contradictions slip in unreviewed.

1. Save the diff of the fix commits only (from the commit the reviewer saw to the branch head) to the scratchpad.
2. Send it to the same reviewer agent with `SendMessage` (its agent id from the first review), so it keeps its context. If it cannot be resumed (for example after the session was cleared), start a fresh `standards-reviewer` and give it the earlier review comments, the fix diff and the whole branch diff. Ask it to confirm each earlier finding is resolved, check the fixes for new problems, and check the docs and schemas still agree.
3. Verify its findings as in step 3 above and post them as a comment as in step 4. If you fix anything again, repeat from step 1.
4. Stop only when the reviewer reports nothing open (or only findings you have rejected with a reason).

### Handing a pull request to the owner

Fill in the description from the template. Its Review block names the commit the final review (and tester run) covered, which must be the head of the branch; ADR 16 gives the exact form and which values go together. If every finding still open was rejected with a reason, the value is `rejected findings only`, never `OK TO MERGE`. A fix made after the tester ran also gets a tester second look, and a fix for the tester gets a reviewer second look. Anything the owner must read or decide (a question, an offer of a review, a new or changed ADR, player-facing wording they have not approved) goes under "Waiting on the owner" at the top, and is said again when you tell the owner the pull request is ready for them to release.

Never pass the reviewer's output on unchecked. If the review finds a gap in the checklist, update `docs/review-checklist.md` in the same branch.

### The pull request guard

A hook (`scripts/pr-guard.mjs`, rules in `scripts/pr-guard-policy.mjs`, wired in `.claude/settings.json`) checks every Bash and PowerShell command. A command that never mentions `gh` passes untouched. One that mentions `gh` passes only if `gh` is the program and the command is on its allowlist: no `gh pr ready` (except `--undo`), `gh pr merge` or `gh pr reopen`, `gh pr create` only with `--draft`, and `gh api` only to read. Anything with `gh` elsewhere is refused, on purpose, even when harmless: write `gh` arguments out in full, pass long text with `--body-file`, write commit messages with `git commit -F <file>` (a message that mentions `gh` is refused with `-m`), and search with the Grep tool. A command that mentions `gh` and has `$`, backticks, a here-document or an argument starting with an unquoted `(` or `{` is refused. A refusal is the answer: do not look for a way round it. Like the qa-tester's hook it loads only in a session started in this folder with the trust prompt accepted. Canary, once per new setup: in such a session, `gh pr ready 99999` and `gh pr merge 99999` must be refused with a `pr-guard:` reason, and `gh pr list` must run, and so must an ordinary command in both the Bash and the PowerShell tool. (No pull request 99999 exists, so the check is harmless if the hook is not running.) The evidence is `node_modules/.cache/pr-guard.log`, one line per command that mentions `gh`. If the hook cannot start (for example after checking out a commit from before ADR 16), it blocks every Bash and PowerShell call: ask the owner to run `! git checkout <branch>` (their own commands do not go through the hook) or to start a new session.

## Test as a player

Also run the `qa-tester` subagent (`.claude/agents/qa-tester.md`) before handing a pull request to the owner when it changes a file under `packages/` (except `packages/quiz-validator/`), `content/` or `e2e/` other than a Markdown file, or one of the scripts that run the app (`scripts/web-dev-server.mjs`, `scripts/qa-server.mjs`, `scripts/qa-ws.mjs`), unless the owner exempts it in the conversation ([ADR 16](docs/adr/0016-the-owner-releases-pull-requests.md)). Any other pull request records the tester as `not applicable`. Its goal is an excellent experience: the app does what is required, it is easy and clear to use (usability heuristics), and everyone can use it (WCAG 2.2 AA). It writes end-user tests for the test frameworks to run, from the scenarios in `docs/qa-scenarios.md`, and plays the app itself as a set of personas. It reports what broke, confused or excluded someone, with the requirement, principle or WCAG criterion each finding rests on; it never fixes the app.

1. Finish the branch and run `npm run check`.
2. Give the tester the branch, the commit and the scenario IDs that apply (or "all that are runnable"). It leaves the tests it wrote in the working tree (under `e2e/qa/` and `packages/worker/test/qa/` only, the two folders it owns; the helpers and configuration are the author's); read them as code, run `npm run format` and then `npm run check` on them (the tester cannot run `format`), and commit them. Exploratory `*.explore.spec.ts` files are git-ignored and never committed.
3. Verify each finding yourself by repeating it. A tester can be wrong or hit a flake. Fix the real ones. For any you reject, write the reason.
4. Fixes need a second look by the same tester (same rule as the standards-reviewer: the pull request stays a draft until it reports nothing open).
5. Post the verdict, what was fixed and what was rejected as a pull request comment, put the commit the final run covered in the description's Review block, and tell the user. Core product questions go to the user. Parked product questions (outside the core game) are added to `docs/parked-product-questions.md` with the severity proposed, and do not block the branch.

Update `docs/qa-scenarios.md` in the same branch when a rule or a screen changes, and when a bug turns up that no scenario would have caught. The tester is held by a hook (`scripts/qa-guard.mjs`, tested in `scripts/`, design and accepted risks in [ADR 8](docs/adr/0008-qa-tester-sandbox.md)) to a short allowlist of commands, writes only in its two folders, and reads only inside the repo. It cannot see inside the tests the tester writes, so those are read as code. The hook runs only after the project folder is trusted, so start the session in this folder and accept the trust prompt. Before relying on it in a new setup, run the canary checks in `docs/qa-scenarios.md` (the log the hook writes is the evidence). The tester installs nothing and works with fake content on `localhost` only.

## Commands

```
npm run check      # lint + format check + typecheck + tests (run before every push)
npm run lint
npm run format
npm run typecheck
npm run test
npm run build
npm run web:dev    # the forked quiz page over the fake content, on http://127.0.0.1:3101
npm run test:web   # the Playwright tests that pin the forked page; `npm run check` does not run them, CI does (needs `npx playwright install chromium` once)
```

Node is pinned in `.nvmrc`. Commit hooks run lint-staged and commitlint; never skip them.

## Finishing a task

Update `docs/roadmap.md` (status, next steps, open questions) and the other docs the change touches (README, architecture, protocol, ADR, fidelity), run `npm run check`, push the branch and open the pull request as a draft. When the reviews are done, tell the user it is ready for them to release (and what waits on them, if anything). It merges itself once they mark it ready and CI is green.
