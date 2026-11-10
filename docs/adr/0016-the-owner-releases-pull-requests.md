# 16. The owner releases pull requests, and every pull request is reviewed

Status: accepted (2026-11-10). Partly supersedes [ADR 5](0005-auto-merge-owner-pull-requests.md): auto-merge stays, but the owner, not the author, marks a pull request ready, and the review ADR 5 relied on is now required and recorded.

## Context

[ADR 5](0005-auto-merge-owner-pull-requests.md) lets the owner's pull requests merge themselves once `check` passes. It relied on review happening earlier and named no check for it. Pull request 31 then merged 2 minutes 31 seconds after it was opened, with no review: the author (Claude) had written its own exemption into the roadmap and opened the pull request as ready with a question in it ([incident note](../incident-5b-merged-without-review.md)). Two more gaps showed up when looking at it:

- Auto-merge is turned on once, when a pull request is marked ready. A commit pushed after that merges on the next green `check`, reviewed or not.
- The rule that the second look goes to the same reviewer through `SendMessage` broke on pull request 32: after the session was cleared the reviewer could not be resumed, and its findings lived only in the lost session.

The author opens pull requests with the owner's own `gh` login, so anything the owner can do on GitHub, the author can do too. Rules in `CLAUDE.md` alone did not hold.

## Decision

The owner chose these on 2026-11-10 (controls C1 to C4 of the incident note, the guard in place of its C5, and a durable review record).

1. **Drafts only; the owner releases.** The author opens every pull request as a draft. The owner reads it and marks it ready, which is what lets auto-merge merge it (the workflow of ADR 5 is unchanged). The author never marks a pull request ready, merges it or reopens it. To change a pull request the owner has marked ready, the author first takes it back to draft (`gh pr ready --undo`); the owner releases it again.
2. **A guard holds the author to that.** A PreToolUse hook (`scripts/pr-guard.mjs`, rules in `scripts/pr-guard-policy.mjs`, wired in `.claude/settings.json`) reads every Bash and PowerShell command in the main session and its subagents. A command that never mentions `gh` passes untouched. A command that mentions `gh` is refused unless every place `gh` appears is the program of a command on a short allowlist, with exact flags: `gh pr create` only with the bare `--draft` switch; `gh pr ready` only with the bare `--undo` switch; `gh pr view`, `list`, `diff`, `checks`, `status`, `comment`, `edit` and `close`; `gh api` with one method, GET (no fields, no input, no GraphQL); `gh auth status` without the flags that print the token; and a few others that cannot release or merge (`gh run view`, `gh issue create` and the like, listed in the policy). `gh pr merge`, `gh pr reopen`, `gh repo edit`, `gh secret` and anything not listed are refused, with a reason. So is any command that mentions `gh` where it cannot be judged: with `$` (variables, substitution), backticks, `<(...)` or here-documents anywhere, with an unquoted `(` anywhere after the start of a command, an argument that starts with `{`, or a brace that bash would expand (PowerShell runs a bracket first, bash expands a brace), or with `gh` somewhere other than the program, such as inside a quoted string run by `bash -c`, `node -e` or `ssh`, after `env` or `xargs`, or as a search word. Every command that mentions `gh` is logged (`node_modules/.cache/pr-guard.log`), which is the evidence for the canary in `CLAUDE.md`.
3. **Every pull request is reviewed** by the `standards-reviewer`, with the second look after fixes, unless one of these holds:
   - it is **docs-only**: every changed file is a Markdown file under `docs/`, and none of them is a rule document: nothing under `docs/adr/`, and not `architecture.md`, `engineering-practices.md`, `dependency-vetting.md`, `review-checklist.md` or `qa-scenarios.md` (an ADR records a decision, and the others are the rules the reviewer and the tester apply, so a change to them is reviewed like code); or
   - the owner exempted that pull request in the conversation, and the description quotes the owner's words.

   The author never decides that a change is too small, and never writes an exemption into the roadmap, an ADR or a description on its own. When the roadmap and `CLAUDE.md` disagree about a review, `CLAUDE.md` wins and the author raises the conflict.

   The `qa-tester` runs on every pull request that changes a file under `packages/` (except `packages/quiz-validator/`), `content/` or `e2e/` other than a Markdown file, or one of the scripts that run the app (`scripts/web-dev-server.mjs`, `scripts/qa-server.mjs`, `scripts/qa-ws.mjs`), unless the owner exempts it the same way. Any other pull request records the tester as not applicable. This replaces the judgement "changes how the app behaves" with a rule a script can check.

4. **Nothing waits on the owner unannounced.** A pull request that asks the owner something, offers a review, adds or changes an ADR, or has player-facing wording the owner has not approved says so first, under "Waiting on the owner" in its description, and the author says it again when handing the pull request over.
5. **Reviews are recorded on the pull request.** The author opens the draft before the review, and posts each review (the first and every second look) as a pull request comment: the commit reviewed, the verdict, and each finding with what was done (fixed, or rejected with the reason). The second look goes to the same reviewer through `SendMessage` while it can be resumed; if it cannot, a fresh reviewer gets the earlier review comments, the fix diff and the whole branch diff.
6. **The description carries a Review block** in this exact form, one line each, filled in from the pull request template:

   ```
   ## Review

   Reviewer: OK TO MERGE | rejected findings only | docs-only | exempt
   Reviewed commit: <full or 7+ character SHA> | none
   QA tester: OK TO MERGE | rejected findings only | not applicable | exempt
   QA commit: <full or 7+ character SHA> | none
   Exempt: none | "<the owner's words>"
   ```

   The values go together like this. Anything else is invalid.

   | Line value                          | Its commit line                    | Holds only if                                                                                 |
   | ----------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
   | `Reviewer: OK TO MERGE`             | `Reviewed commit:` the branch head | The last review of the head said OK TO MERGE (or "nothing open" on a second look)             |
   | `Reviewer: rejected findings only`  | `Reviewed commit:` the branch head | Every finding still open in the last review is rejected, with the reason, in a review comment |
   | `Reviewer: docs-only`               | `Reviewed commit: none`            | Every changed file meets the docs-only rule in item 3                                         |
   | `Reviewer: exempt`                  | `Reviewed commit: none`            | `Exempt:` quotes the owner's words                                                            |
   | `QA tester: OK TO MERGE`            | `QA commit:` the branch head       | The last tester run on the head said OK TO MERGE                                              |
   | `QA tester: rejected findings only` | `QA commit:` the branch head       | As for the reviewer                                                                           |
   | `QA tester: not applicable`         | `QA commit: none`                  | No changed file is one the tester rule in item 3 covers                                       |
   | `QA tester: exempt`                 | `QA commit: none`                  | `Exempt:` quotes the owner's words                                                            |
   | `Exempt: none`                      |                                    | Neither line says `exempt`                                                                    |

   Both commits must be the head of the branch, so the last change on a branch is seen by the reviewer and, when it applies, by the tester. A fix made for one after the other has run gets a second look from both (the tester's can be limited to the scenarios the fix touches). A second pull request (`chore/review-gate`) adds a `review-gate` CI check that reads this block and the changed files and fails unless this table holds, and the owner adds `review-gate` to the required checks of the `main` ruleset. The check reads only the description and the file list, and never runs code from the pull request (the rule of ADR 5).

## Consequences

- The owner clicks "Ready for review" once per pull request. That gives back part of the delay ADR 5 removed, in exchange for a real gate: the click is the release, and nothing merges without it. Docs-only pull requests need the click too.
- The click is the strong control; the guard is a speed bump. It reads command text, so it stops mistakes and habits, not an author set on getting round it: a `gh` call built so the text does not show it, `curl` with a token, the GitHub web page, or a session started outside this folder (where the project hooks do not load) all pass. It also refuses harmless commands that mention `gh` where it is not the program, on purpose: a commit message with the word in it, a search for it, a body built with `$(...)`. The refusal says what to do instead (`git commit -F <file>`, the Grep tool, `--body-file`).
- The guard is a project hook, so it binds only a session started in this folder whose trust prompt was accepted, and it loads when the session starts. After it merges, check it once in a new session (the canary in `CLAUDE.md`).
- The hook fails closed: if `scripts/pr-guard.mjs` cannot be started (for example the session checked out a commit from before this ADR), every Bash and PowerShell call is blocked, ordinary ones included. The owner recovers with a command of their own (`! git checkout <branch>`), which does not go through the hook, or by starting a new session. `CLAUDE.md` says so next to the canary.
- The `review-gate` check cannot tell that a review really happened; the author could write the lines without one. What it does is turn a quiet judgement ("not required") into a false statement in writing, and catch forgetting. With the Review block's commit tied to the head, a commit pushed after review fails it.
- Repository settings (the ruleset, the auto-merge setting, the token) are changed by the owner. The guard refuses the API calls that would change them.
- Dependabot pull requests are not affected: they never auto-merge, and the owner merges them by hand.
