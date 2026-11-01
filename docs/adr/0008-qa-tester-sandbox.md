# 8. How the qa-tester is held to its limits

Status: accepted (2026-11-01)

## Context

The `qa-tester` subagent ([qa-scenarios.md](../qa-scenarios.md)) writes end-user tests, has the test frameworks run them, and runs commands to start the app. It needs a shell and file writes, which are powerful. The owner wants its limits enforced, not just written in its instructions. On native Windows, Claude Code has no per-agent command allowlist in an agent's `tools` field, session-wide permission rules would also bind the main session, and the built-in sandbox needs WSL2 and is also session-wide.

## Decision

A `PreToolUse` hook in the agent's own frontmatter runs `scripts/qa-guard.mjs` on every Bash, Write, Edit, Read, Grep and Glob call it makes. The rules are in `scripts/qa-guard-policy.mjs` and are an allowlist throughout:

- **Bash:** `npm run` for a fixed list of scripts (`check`, `test`, `lint`, `typecheck`, `qa:start`, `qa:stop`, `qa:ws`, `qa:browser`), with no arguments except an exact set of flags and value patterns for the two test scripts; `curl` to `localhost` or `127.0.0.1` with a port, read-only; three read-only `git` commands. Any character outside printable ASCII, and any shell syntax (chaining, pipes, redirects, quotes, globs, substitutions), is refused before the command is looked at.
- **Write and Edit:** `.ts` and `.json` files under `e2e/qa/` and `packages/worker/test/qa/` only, by absolute path, never `package.json`, `tsconfig*` or `node_modules`, never names that Windows or the shell treat specially (`:`, `~`, device names, trailing dots or spaces). The tester owns those two folders; the author owns the helpers and the test configuration, so the tester cannot weaken the suite or the configuration it runs under. No Markdown, so no planted `CLAUDE.md`.
- **Read, Grep and Glob:** only inside the repo, so real files elsewhere (the owner's vault) cannot be pulled into a test, a fixture or a report of a public repo.
- The agent file removes the tools that would get round the hook (PowerShell, web access, sub-agents, skills, notebook edits) and lists the tools it keeps.
- The hook command is `node "$CLAUDE_PROJECT_DIR/scripts/qa-guard.mjs" || exit 2`, so a failure to start the script blocks the call in any shell, and the script itself exits 2 on anything it cannot read. Each decision is appended to `node_modules/.cache/qa-guard.log`. The canary check in `qa-scenarios.md` uses that log as evidence the hook ran, since the model's own account of a refusal is not evidence.
- The policy is plain code with tests, including a process-level test of the hook and a test that reads the agent file to check the wiring.

## Accepted risks (the owner chose these, 2026-11-01)

- **Tester-written code is not sandboxed.** The tester can write `.ts` files under its folders, and `npm run qa:*`, `test` and `check` run them with the owner's full privileges. The hook limits what the tester types, not what its tests do. This is accepted because everything is local, the content is fake, the repo is public and holds no secrets, and the tests are read as code by the author before they are committed. The tester's instructions say not to use it; that is a request, not a control.
- **Path checks are lexical.** A symlink or junction inside a writable folder is not followed or detected.
- **The hook depends on trust.** Frontmatter hooks of a project agent run only after the project folder is trusted. Until then nothing is enforced. A hook that allows a call also skips the owner's normal permission prompt for it.
- **Two things are unconfirmed until the canary check passes on the owner's machine:** that `$CLAUDE_PROJECT_DIR` is set in the hook's environment, and that `onFailure: block` is honoured (the `|| exit 2` does not depend on it).
- **Stricter containment** (running the tester in WSL2 with the built-in sandbox, or in a container or virtual machine) is possible and heavier. Revisit it when the worker lands, or if the app ever holds real data.

## Consequences

- Adding a script the tester may run, a flag, or a writable folder is a change to `scripts/qa-guard-policy.mjs` with a test, reviewed like other code. Allowlists, not denylists: a new tool flag is refused until someone adds it on purpose (review checklist G8).
- The branches that make the scripts real (`feat/worker`, `feat/web-versus`, `feat/e2e`) add `qa:start`, `qa:stop`, `qa:ws` and `qa:browser` to `package.json`, add the test configuration outside the tester's folders, and leave exploratory `*.explore.spec.ts` files out of it.
- Real screen readers, real devices and real players are outside what any of this can check; the tester lists them in every report.
