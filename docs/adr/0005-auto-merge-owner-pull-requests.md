# 5. Auto-merge the owner's pull requests once checks pass

Status: accepted (2026-11-01)

## Context

Every pull request waited for the owner to click merge after CI went green. With one maintainer and a required `check` status, the click adds no review, only delay. The human review that matters happens earlier: the `standards-reviewer` runs before a major pull request is opened.

## Decision

A workflow (`.github/workflows/auto-merge.yml`) turns on GitHub's auto-merge for pull requests opened by the repository owner. GitHub then merges, with a merge commit, when the required `check` status passes and the branch has no conflicts. It needs no third-party action and does not check out code.

- A draft pull request is not auto-merged. Opening one as a draft holds it back; marking it ready releases it.
- Dependabot and fork pull requests are skipped and stay manual.
- The repository setting "Allow auto-merge" must be on. Only the owner can change it.

## Consequences

- A pull request merges itself when CI is green, so anything that must be read first goes up as a draft.
- Branch protection stays the gate: if `check` is not required, auto-merge would not wait for it.
- The workflow token is write-scoped, so the workflow must never run code from the pull request. It only calls `gh`.
- A merge made with the workflow token may not start the `push` run of CI on `main`. This is unverified; check after the first auto-merge.
