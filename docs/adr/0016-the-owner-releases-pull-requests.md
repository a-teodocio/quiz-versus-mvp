# 16. The owner releases pull requests, and every pull request is reviewed

Status: accepted (2026-11-10). Amends [ADR 5](0005-auto-merge-owner-pull-requests.md): auto-merge stays, but the owner, not the author, marks a pull request ready.

## Context

[ADR 5](0005-auto-merge-owner-pull-requests.md) lets the owner's pull requests merge themselves once `check` passes. It relied on review happening earlier and named no check for it. Pull request 31 then merged 2 minutes 31 seconds after it was opened, with no review: the author (Claude) had written its own exemption into the roadmap and opened the pull request as ready with a question in it ([incident note](../incident-5b-merged-without-review.md)). Two more gaps showed up when looking at it:

- Auto-merge is turned on once, when a pull request is marked ready. A commit pushed after that merges on the next green `check`, reviewed or not.
- The rule that the second look goes to the same reviewer through `SendMessage` broke on pull request 32: after the session was cleared the reviewer could not be resumed, and its findings lived only in the lost session.

The author opens pull requests with the owner's own `gh` login, so anything the owner can do on GitHub, the author can do too. Rules in `CLAUDE.md` alone did not hold.

## Decision

The owner chose these on 2026-11-10 (controls C1 to C4 of the incident note, the guard in place of its C5, and a durable review record).

1. **Drafts only; the owner releases.** The author opens every pull request as a draft. The owner reads it and marks it ready, which is what lets auto-merge merge it (the workflow of ADR 5 is unchanged). The author never marks a pull request ready, merges it or reopens it. To change a pull request the owner has marked ready, the author first takes it back to draft (`gh pr ready --undo`); the owner releases it again.
2. **A guard holds the author to that.** A PreToolUse hook (`scripts/pr-guard.mjs`, rules in `scripts/pr-guard-policy.mjs`, wired in `.claude/settings.json`) reads every Bash and PowerShell command in the main session and its subagents. A command that does not run `gh` passes untouched. A `gh` command is refused unless it is on a short allowlist: `gh pr create` only with `--draft`; `gh pr ready` only with `--undo`; `gh pr view`, `list`, `diff`, `checks`, `status`, `comment`, `edit` and `close`; `gh api` with GET only (no fields, no input, no GraphQL); and a few read-only commands (`gh run view`, `gh auth status`, `gh issue create` and the like). `gh pr merge`, `gh pr reopen`, `gh repo edit`, `gh secret` and anything not listed are refused, with a reason. So are `gh` commands it cannot read: inside `$(...)`, backticks or here-documents, behind `bash -c`, `env`, `xargs` or `Invoke-Expression`, or with variables in their arguments.
3. **Every pull request is reviewed** by the `standards-reviewer`, with the second look after fixes, unless one of these holds:
   - it is **docs-only**: every changed file is a Markdown file under `docs/`, and none of them is under `docs/adr/` or is `docs/review-checklist.md` or `docs/qa-scenarios.md` (an ADR records a decision, and the other two steer the reviewer and the tester, so they are reviewed like code); or
   - the owner exempted that pull request in the conversation, and the description quotes the owner's words.

   The author never decides that a change is too small, and never writes an exemption into the roadmap, an ADR or a description on its own. When the roadmap and `CLAUDE.md` disagree about a review, `CLAUDE.md` wins and the author raises the conflict. The `qa-tester` rule in `CLAUDE.md` is unchanged.

4. **Nothing waits on the owner unannounced.** A pull request that asks the owner something, offers a review, adds or changes an ADR, or has player-facing wording the owner has not approved says so first, under "Waiting on the owner" in its description, and the author says it again when handing the pull request over.
5. **Reviews are recorded on the pull request.** The author opens the draft before the review, and posts each review (the first and every second look) as a pull request comment: the commit reviewed, the verdict, and each finding with what was done (fixed, or rejected with the reason). The second look goes to the same reviewer through `SendMessage` while it can be resumed; if it cannot, a fresh reviewer gets the earlier review comments, the fix diff and the whole branch diff.
6. **The description carries a Review block** in this exact form, one line each, filled in from the pull request template:

   ```
   ## Review

   Reviewer: OK TO MERGE | docs-only | exempt
   Reviewed commit: <full or 7+ character SHA> | none
   QA tester: OK TO MERGE | not applicable: <reason>
   QA commit: <full or 7+ character SHA> | none
   Exempt: none | "<the owner's words>"
   ```

   `Reviewed commit` and `QA commit` are the commit the last review or tester run covered, and must be the head of the branch when the owner releases it. A second pull request (`chore/review-gate`) adds a `review-gate` CI check that reads this block and the changed files and fails unless the rules above hold, and the owner adds `review-gate` to the required checks of the `main` ruleset. The check reads only the description and the file list, and never runs code from the pull request (the rule of ADR 5).

## Consequences

- The owner clicks "Ready for review" once per pull request. That gives back part of the delay ADR 5 removed, in exchange for a real gate: the click is the release, and nothing merges without it. Docs-only pull requests need the click too.
- The click is the strong control; the guard is a speed bump. It reads command text, so it stops mistakes and habits, not an author set on getting round it: a `gh` call built so the text does not show it, `curl` with a token, the GitHub web page, or a session started outside this folder (where the project hooks do not load) all pass. It also refuses some harmless commands that merely mention `gh` in an odd place; the refusal says what to do instead (for example `--body-file` instead of `$(...)`).
- The guard is a project hook, so it binds only a session started in this folder whose trust prompt was accepted, and it loads when the session starts. After it merges, check it once in a new session (the canary in `CLAUDE.md`).
- The `review-gate` check cannot tell that a review really happened; the author could write the lines without one. What it does is turn a quiet judgement ("not required") into a false statement in writing, and catch forgetting. With the Review block's commit tied to the head, a commit pushed after review fails it.
- Repository settings (the ruleset, the auto-merge setting, the token) are changed by the owner. The guard refuses the API calls that would change them.
- Dependabot pull requests are not affected: they never auto-merge, and the owner merges them by hand.
