// PreToolUse hook for the main session and every subagent (wired in .claude/settings.json). Reads
// the tool call as JSON on stdin and applies scripts/pr-guard-policy.mjs: a `gh` command that would
// mark a pull request ready, merge it, reopen it or open it as other than a draft is blocked (exit
// code 2, the reason on stderr). See docs/adr/0016-the-owner-releases-pull-requests.md.
//
// An allowed call exits 0 and prints nothing. Printing an "allow" decision here would approve every
// Bash and PowerShell call without asking the user, so this hook only ever refuses.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process, { stderr } from 'node:process';
import { decide } from './pr-guard-policy.mjs';

/** One line per judged command (one that mentions `gh`), kept out of the repo's tracked files. */
const LOG_FILE =
  process.env.PR_GUARD_LOG ??
  join(import.meta.dirname, '..', 'node_modules', '.cache', 'pr-guard.log');

/** Records a decision, the evidence for the canary in CLAUDE.md. A failure to log changes nothing. */
function record(input, verdict) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    const command = String(input?.tool_input?.command).slice(0, 200);
    const line = `${new Date().toISOString()} ${verdict.allow ? 'ALLOW' : 'DENY'} ${String(input?.tool_name)} ${JSON.stringify(command)} ${verdict.reason}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {
    // The log is evidence for a person checking the hook; the decision stands without it.
  }
}

function main() {
  let input;
  let verdict;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
    verdict = decide(input);
  } catch (error) {
    stderr.write(`pr-guard: could not read the tool call, so it is blocked (${String(error)})\n`);
    return 2;
  }
  if (verdict.judged) record(input, verdict);
  if (verdict.allow) return 0;
  stderr.write(`${verdict.reason}\n`);
  return 2;
}

process.exitCode = main();
