# 5. Auto-merge the owner's pull requests once checks pass

Status: accepted (2026-11-01). Amended by [ADR 16](0016-the-owner-releases-pull-requests.md): the author opens every pull request as a draft and the owner marks it ready; the review this ADR relied on is now required and recorded.

## Context

Every pull request waited for the owner to click merge after CI went green. With one maintainer and a required `check` status, the click adds no review, only delay. The human review that matters happens earlier: the `standards-reviewer` runs before a major pull request is opened.

## Decision

A workflow (`.github/workflows/auto-merge.yml`) turns on GitHub's auto-merge for pull requests opened by the repository owner. GitHub then merges, with a merge commit, when the required `check` status passes and the branch has no conflicts. It needs no third-party action and does not check out code.

- A draft pull request is not auto-merged. Opening one as a draft holds it back; marking it ready releases it.
- Dependabot and fork pull requests are skipped and stay manual.
- The repository setting "Allow auto-merge" must be on. Only the owner can change it.
- The workflow turns auto-merge on with a fine-grained personal access token, the repository secret `AUTO_MERGE_TOKEN` (2026-11-02). Scope: this repository only, Contents and Pull requests read and write. GitHub attributes the later merge to whoever enabled auto-merge. Under the workflow token (`github.token`) the merge started no workflows, so CI did not run on `main`, and the head branch was not deleted although "Automatically delete head branches" was on (seen on pull request 18).

## Consequences

- A pull request merges itself when CI is green, so anything that must be read first goes up as a draft.
- Branch protection stays the gate: if `check` is not required, auto-merge would not wait for it.
- The token can merge into this repository, so the workflow must never run code from the pull request. It only calls `gh`, and only for the owner's non-draft pull requests (fork pull requests get no secrets).
- The token expires (set a reminder, at most one year). When it does, auto-merge stops enabling and pull requests wait for a manual merge. Renew it and update the secret.
- Verified on pull request 20 (2026-11-02): with the token, CI runs on `main` for the merge commit and the head branch is deleted. If either stops, suspect an expired token first.
