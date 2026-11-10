## Waiting on the owner

<!-- Anything the owner must read or decide before releasing this: a question, a new or changed ADR, player-facing wording not yet approved. "Nothing" if there is none. -->

## What and why

<!-- One or two sentences. Link the ADR if this changes a decision. -->

## How it was tested

<!-- Unit / integration / e2e added or changed. Paste the command you ran. -->

## Review

<!-- Exact form, one value per line (docs/adr/0016-the-owner-releases-pull-requests.md). The commits are the ones the last review and tester run covered, and must be the head of the branch. Each review is posted as a comment on this pull request. -->

Reviewer: OK TO MERGE | docs-only | exempt
Reviewed commit: <sha> | none
QA tester: OK TO MERGE | not applicable: <reason>
QA commit: <sha> | none
Exempt: none | "<the owner's words>"

## Checklist

- [ ] Branch is `feat/...`, `fix/...`, `chore/...` or `docs/...`
- [ ] `npm run check` passes locally
- [ ] Layer rules respected (docs/architecture.md); no new cross-package imports
- [ ] Docs updated (README, architecture, protocol, ADR) where behaviour changed
- [ ] `docs/roadmap.md` updated (status, next steps, open questions)
- [ ] The `standards-reviewer` ran (or the change is docs-only, or the owner exempted it), the same reviewer looked again at every fix, and each review is a comment on this pull request
- [ ] If the app runs (from `feat/worker`): the `qa-tester` ran, its findings were verified, the same tester looked again at the fixes, and its result is a comment on this pull request
- [ ] No real course content, questions, images or notes (this repo is public)
