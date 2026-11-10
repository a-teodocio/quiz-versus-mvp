// PreToolUse hook for the main session and every subagent (wired in .claude/settings.json). Reads
// the tool call as JSON on stdin and applies scripts/pr-guard-policy.mjs: a `gh` command that would
// mark a pull request ready, merge it, reopen it or open it as other than a draft is blocked (exit
// code 2, the reason on stderr). See docs/adr/0016-the-owner-releases-pull-requests.md.
//
// An allowed call exits 0 and prints nothing. Printing an "allow" decision here would approve every
// Bash and PowerShell call without asking the user, so this hook only ever refuses.
import { readFileSync } from 'node:fs';
import process, { stderr } from 'node:process';
import { decide } from './pr-guard-policy.mjs';

function main() {
  let verdict;
  try {
    verdict = decide(JSON.parse(readFileSync(0, 'utf8')));
  } catch (error) {
    stderr.write(`pr-guard: could not read the tool call, so it is blocked (${String(error)})\n`);
    return 2;
  }
  if (verdict.allow) return 0;
  stderr.write(`${verdict.reason}\n`);
  return 2;
}

process.exitCode = main();
