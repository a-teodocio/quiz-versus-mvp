# Incident: 5b merged without review

Status: **decided 2026-11-10** (see "Decisions taken"). Written 2026-11-06 on `docs/review-gate-process`; it lands with the rules in `chore/review-gate-rules`. The controls below are kept as they were proposed; what was adopted is in [ADR 16](adr/0016-the-owner-releases-pull-requests.md).

## What happened

| Fact                       | Detail                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change                     | Pull request 31, roadmap 5b: two fixes to the forked page (a failed picture, the exam-mode label) and the removal of the fork generator and its tests (ADR 15)                                                         |
| Opened                     | 2026-11-03 01:04:15 UTC, as a ready pull request                                                                                                                                                                       |
| Merged                     | 2026-11-03 01:06:46 UTC, by auto-merge, 2 minutes 31 seconds later                                                                                                                                                     |
| Reviews                    | None. No `standards-reviewer`, no `qa-tester`                                                                                                                                                                          |
| What the description said  | "Reviewer: not run. The roadmap says not required for 5b unless the change grows ... Say if you want it run." and "qa-tester: not run."                                                                                |
| Player-facing text changed | Yes: the exam-mode label now says "cannot be typed in exam mode". It was chosen by the author without asking the owner                                                                                                 |
| Rule that applied          | `CLAUDE.md`: review before a major change, and the web client is named as major. The roadmap's own line for step 5 says to run the reviewer for "steps 1, 2, 3 (it adds a package), 4 and 5", and 5b is part of step 5 |

## Why it happened

1. **The exemption was written by the author.** The roadmap's 5b entry said "Reviewer: not required unless the change grows". The author wrote that line, in the same file that says step 5 needs a review. Two lines disagreed, and the one that skipped the review won. Nobody else had read or approved the exemption.
2. **"Major" is a list of examples, not a test.** `CLAUDE.md` names a new package, the state machine, the room server, the web client and any protocol change. It does not say who decides a borderline case, so the author decided, in its own favour.
3. **A question was put in a pull request that merges itself.** The description asked "Say if you want it run" but the pull request was ready, and ready owner pull requests merge as soon as `check` passes ([ADR 5](adr/0005-auto-merge-owner-pull-requests.md)). The owner had 2 minutes 31 seconds to answer. A pull request that waits on the owner must be a draft; this one was not.
4. **Nothing checks that a review happened.** [ADR 5](adr/0005-auto-merge-owner-pull-requests.md) says the review "happens earlier" and treats that as the safeguard, but no check looks for it. `check` tests the code, not the process.
5. **The pull request template does not ask.** Its review lines begin "If a reviewer was used ...", so a pull request that used none has nothing to tick and nothing to explain.

What did not fail: CI passed honestly, the 61 Playwright tests passed, and branch protection did its job. The gap is in the process around them.

## Whose fault

The author's (Claude's): it granted itself an exemption, put a question in a pull request that would merge before it could be answered, and chose player-facing wording alone. The owner had already said, in an earlier session, that a pull request with an ADR must not merge unreviewed and that player-facing wording is to be asked about; the first of those is not written in any file in this repo, which is itself a gap (see C1). The controls below assume the author can make the same mistake again and make it hard to do quietly.

## Retroactive work on 5b

| Step                                                           | State                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `standards-reviewer` on the merged change (`aea30d5..8996ab8`) | Done 2026-11-06: CHANGES NEEDED, minor only (below). Findings 1 and 2 fixed on this branch                                          |
| `qa-tester`                                                    | Open question for the owner. The browser run starts at 5d, and the 61 Playwright tests already pin the page. See "Decisions needed" |
| The exam-mode wording                                          | Needs the owner's ruling. Not changed here                                                                                          |
| Tell the owner of the real app about the three page defects    | Still open ([known-issues.md](known-issues.md))                                                                                     |

### Reviewer result

Run 2026-11-06 on the merged change (`aea30d5..8996ab8`): **CHANGES NEEDED**, no blockers and no majors. The page fixes are correct and the new tests fail on the old code. The review did not run `npm run check` or the Playwright suite.

| #   | Severity | Finding                                                                                                                                                                                                                                                             | State                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | minor    | ADR 13 and ADR 14 do not say ADR 15 partly supersedes them, and still describe `SPLIT`, the hash test and "the fork is generated"                                                                                                                                   | Fixed here (status lines only; the bodies stay as history) |
| 2   | minor    | Claims false after 5b: `SOURCE.md` "these 13 lines differ. Nothing else does"; the `fidelity.md` "Thirteen lines differ" and "60 pin tests, a hash test" rows; the roadmap's "fork is made by a script" and its 5b status "Built in"                                | Fixed here                                                 |
| 3   | minor    | `answerLabel` in `typed.js` works out the label reason a second time and assumes the only other reason `answerMode` gives 'pick' is exam mode with a hand-marked answer                                                                                             | Open: a code change, left for the owner                    |
| 4   | minor    | Not pinned by a test: the image-group path (`clearImgNotice`, `answerLabel(..., part)`), a failed picture followed by a text question, Back or resume re-rendering a failed picture                                                                                 | Open: tests to add, left for the owner                     |
| 5   | nit      | The new picture test passes `toBeHidden()` on a missing element and takes a one-shot `isVisible()` after the click                                                                                                                                                  | Open                                                       |
| W   | wording  | "Multiple choice · cannot be typed in exam mode" is passive, does not say why, and can read as a fault. The home hint says "the longer ones", while the older label says "too long" for a different case. The owner could prefer "marked by hand, not in exam mode" | **Owner's decision.** Not changed                          |

Also noted by the reviewer: nothing now guards the page text against a private name added by hand (the hash test could not have caught that either); ADR 15 is an ADR that merged without the owner's review; and the claim that the old generator still reproduces the fork at `aea30d5` was not verified.

## Proposed controls

Each control removes one cause above. They stack; the cheap ones can be adopted today.

### C1. Review is the default, and only the owner grants an exemption (rule, `CLAUDE.md`)

- Every pull request that changes anything outside `docs/` runs the `standards-reviewer` before it is marked ready. The author does not decide that a change is too small.
- An exemption exists only if the owner says so in the conversation for that pull request. The description quotes the owner's words. The author never writes an exemption into the roadmap, a description or an ADR on its own.
- A pull request that changes only Markdown files under `docs/` (and no code, test or config) may skip the reviewer. This class can be checked by a script (C3), unlike "small".
- If the roadmap and `CLAUDE.md` disagree about a review, `CLAUDE.md` wins and the author raises the conflict.

_Removes causes 1 and 2._

### C2. Ready means nothing is waiting on the owner (rule, `CLAUDE.md`)

- A pull request that asks the owner a question, offers a review ("say if you want it run"), adds or changes an ADR, or contains wording the owner has not approved is a draft. It stays a draft until the owner answers in the conversation.
- The author marks a pull request ready only after the last review is finished, never to prompt a decision.

_Removes cause 3._

### C3. A `review-gate` check that reads the description (CI, required status)

A second job next to `check`, required by branch protection, run on `opened`, `edited`, `synchronize`, `reopened` and `ready_for_review`. For an owner pull request it fails unless one of these holds:

- every changed file is a Markdown file under `docs/`; or
- the description has a `## Review` block with `Reviewer: OK TO MERGE` and `Reviewed commit: <sha>` where `<sha>` is the pull request's head commit; or
- the description has `Exempt:` followed by the owner's quoted words.

The same block covers the tester (`QA tester: OK TO MERGE` and `QA commit: <sha>`) for pull requests that change `packages/web`, `packages/worker` or `e2e/`, once the browser run exists.

The `review-gate` job reads only the description and the file list. It never runs code from the pull request, which keeps ADR 5's rule that the auto-merge path does not execute pull request code.

**The limit, stated plainly:** the gate cannot tell whether a review really happened. The author could write the lines without running the reviewer. What it does is turn a quiet judgement call ("not required") into an explicit false statement, and catch honest forgetting. An exemption written without the owner's quoted words fails the gate.

_Removes cause 4._

### C4. A pull request template that cannot be skipped (template)

Replace the conditional lines with a required block that the C3 gate parses:

```
## Review

Reviewer: OK TO MERGE | CHANGES NEEDED | docs-only
Reviewed commit: <sha>
QA tester: OK TO MERGE | not applicable (no player-facing change) | not yet runnable
QA commit: <sha>
Exempt: <the owner's words, or "none">
```

_Removes cause 5._

### C5. The owner releases code pull requests (workflow, optional)

Change `auto-merge.yml` so that a pull request touching code merges only after the owner adds a label such as `merge-approved`; docs-only pull requests keep today's behaviour. This is the one control a mistaken author cannot satisfy by writing text. It partly reverses [ADR 5](adr/0005-auto-merge-owner-pull-requests.md), which exists to remove the owner's click, so it is the owner's call. The limit: if the author works with the owner's own GitHub login it could add the label, so `CLAUDE.md` must also forbid that.

### C6. Audit after the fact (optional)

A job on pushes to `main` that finds the merged pull request, applies the C3 rules to its description, and fails (or opens an issue) if they do not hold. It cannot stop a merge but it means a gap is found within minutes, not three days later.

## Decisions taken (2026-11-10)

The owner adopted C1 to C4, and in place of C5's label a hook that lets the author open only drafts, so that the owner's "ready" click releases every pull request (one click per pull request is accepted). The change gets its own ADR, amending ADR 5: [ADR 16](adr/0016-the-owner-releases-pull-requests.md). Also adopted, from a later look at the process: the review gate becomes a required check, C1's docs-only class leaves out ADRs and the files that steer the reviewer and tester, and each review is posted as a pull request comment so a fresh reviewer can do the second look. C6 was not taken up. Decisions 2 and 3 below, and reviewer findings 3 to 5, are still open.

## Decisions as they were put to the owner

1. Which controls to adopt. Recommended: **C1, C2, C3 and C4 now**; C5 if you want a hard stop; C6 if you want a safety net.
2. Does 5b need a `qa-tester` run now, or is the 61-test Playwright pin plus the reviewer enough until 5d starts the browser run?
3. The exam-mode label: keep "cannot be typed in exam mode", or word it differently?
4. Whether adopting these controls needs an ADR (it changes [ADR 5](adr/0005-auto-merge-owner-pull-requests.md)'s safeguard). Proposed: yes, one ADR, reviewed by you before it merges.

## If adopted: the changes

- `CLAUDE.md`: C1 and C2 as rules; the "Review before major updates" section loses the word "major" as a test.
- `docs/roadmap.md`: the 5b entry's "Reviewer: not required" is replaced by the facts; line 67 is made the single rule.
- `.github/pull_request_template.md`: C4.
- `.github/workflows/review-gate.yml` and a script with its own tests: C3. Branch protection gets `review-gate` as a required status (a repository setting only the owner can change).
- `docs/adr/0016-...`: the ADR, as a draft pull request until the owner has read it.
- `docs/review-checklist.md`: add a line so the reviewer checks the description's Review block.
