# quiz-versus-mvp: working rules for Claude

Mock of a local MLS quiz app, used to trial a live multiplayer (versus) mode before building it for real. The mock data is fake; the code is written to production standards so it can be ported.

## Hard rules

- **Public repo.** Never add real course content, real quiz questions, real images or personal notes. Fake and placeholder content only. Do not add the user's email or any private path from outside this repo to any file.
- **Fidelity.** The mock must behave like the real app (question schema, image-groups, typed answers, option shuffle, progress keys). Every deliberate simplification is recorded in `docs/fidelity.md` as it is made.
- **Writes stay in this repo.** Reading the real app (`knowledge training` in the user's vault) is allowed for reference; copy code and rules, never quiz files or images.
- **Git.** Work on a branch (`feat/`, `fix/`, `chore/`, `docs/`), never commit to `main` directly. Conventional Commits. Push branches as needed. Merge to `main` only through a pull request. Pull requests the owner opens merge themselves when `check` passes (`adr/0005-auto-merge-owner-pull-requests.md`); open one as a draft to hold it back. Delete merged branches.
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

## Review before major updates

Before opening a pull request for a major change (a new package, the state machine, the room server, the web client, any protocol change), run the `standards-reviewer` subagent (`.claude/agents/standards-reviewer.md`). Its rules are in `docs/review-checklist.md`.

1. Finish the branch and run `npm run check`.
2. Save the branch diff to the scratchpad. Give the reviewer the branch name, the changed files and the diff path.
3. Verify each finding against the code yourself. A reviewer can be wrong. Fix the real ones. For any you reject, write the reason.
4. Put the verified result in the PR description (verdict, fixed, rejected with reasons) and tell the user.

### Second look after fixes (mandatory)

Any change made to fix a review's findings needs a second look by the same reviewer before the pull request is merged. No exceptions, including for small fixes and doc-only fixes, because fixes are where new rules and new contradictions slip in unreviewed.

1. Save the diff of the fix commits only (from the commit the reviewer saw to the branch head) to the scratchpad.
2. Send it to the same reviewer agent with `SendMessage` (its agent id from the first review), so it keeps its context. Ask it to confirm each earlier finding is resolved, check the fixes for new problems, and check the docs and schemas still agree.
3. Verify its findings as in step 3 above. If you fix anything again, repeat from step 1.
4. Stop only when the reviewer reports nothing open (or only findings you have rejected with a reason).

Pull requests auto-merge when `check` passes, so the last review must be finished before the pull request is opened as ready. If a pull request is already open and needs fixes, take it back to draft first (`gh pr ready --undo`) and mark it ready again after the second look. Name the commit the final review covered in the pull request description.

Never pass the reviewer's output on unchecked. If the review finds a gap in the checklist, update `docs/review-checklist.md` in the same branch.

## Test as a player before major updates

From the first branch that makes the app run (`feat/worker`), also run the `qa-tester` subagent (`.claude/agents/qa-tester.md`) before opening a pull request for any change that makes the app runnable or changes how it behaves. Its goal is an excellent experience: the app does what is required, it is easy and clear to use (usability heuristics), and everyone can use it (WCAG 2.2 AA). It writes end-user tests for the test frameworks to run, from the scenarios in `docs/qa-scenarios.md`, and plays the app itself as a set of personas. It reports what broke, confused or excluded someone, with the requirement, principle or WCAG criterion each finding rests on; it never fixes the app.

1. Finish the branch and run `npm run check`.
2. Give the tester the branch, the commit and the scenario IDs that apply (or "all that are runnable"). It leaves the tests it wrote in the working tree (under `e2e/qa/` and `packages/worker/test/qa/` only, the two folders it owns; the helpers and configuration are the author's); read them as code, run `npm run format` and then `npm run check` on them (the tester cannot run `format`), and commit them. Exploratory `*.explore.spec.ts` files are git-ignored and never committed.
3. Verify each finding yourself by repeating it. A tester can be wrong or hit a flake. Fix the real ones. For any you reject, write the reason.
4. Fixes need a second look by the same tester (same rule as the standards-reviewer: the pull request stays a draft until it reports nothing open).
5. Put the verdict, what was fixed, what was rejected and the commit the final run covered in the pull request description, and tell the user. Core product questions go to the user. Parked product questions (outside the core game) are added to `docs/parked-product-questions.md` with the severity proposed, and do not block the branch.

Update `docs/qa-scenarios.md` in the same branch when a rule or a screen changes, and when a bug turns up that no scenario would have caught. The tester is held by a hook (`scripts/qa-guard.mjs`, tested in `scripts/`, design and accepted risks in [ADR 8](docs/adr/0008-qa-tester-sandbox.md)) to a short allowlist of commands, writes only in its two folders, and reads only inside the repo. It cannot see inside the tests the tester writes, so those are read as code. The hook runs only after the project folder is trusted, so start the session in this folder and accept the trust prompt. Before relying on it in a new setup, run the canary checks in `docs/qa-scenarios.md` (the log the hook writes is the evidence). The tester installs nothing and works with fake content on `localhost` only.

## Commands

```
npm run check      # lint + format check + typecheck + tests (run before every push)
npm run lint
npm run format
npm run typecheck
npm run test
npm run build
```

Node is pinned in `.nvmrc`. Commit hooks run lint-staged and commitlint; never skip them.

## Finishing a task

Update `docs/roadmap.md` (status, next steps, open questions) and the other docs the change touches (README, architecture, protocol, ADR, fidelity), run `npm run check`, push the branch and open the pull request. It merges itself when CI is green; tell the user, or open it as a draft if they should read it first.
