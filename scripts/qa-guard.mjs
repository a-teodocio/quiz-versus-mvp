// PreToolUse hook for the qa-tester subagent (see .claude/agents/qa-tester.md).
// Reads the tool call as JSON on stdin, applies scripts/qa-guard-policy.mjs, and either allows the
// call or blocks it (exit code 2) with a reason the agent can read. Any problem after the script
// starts blocks. A problem before it starts (node missing, a bad path) is made to block by the hook
// command in the agent file (`... || exit 2`). The one thing that proves the wiring works is the
// canary check in docs/qa-scenarios.md, which reads the log this script writes.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process, { stderr, stdout } from 'node:process';
import { decide } from './qa-guard-policy.mjs';

const REPO_ROOT = join(import.meta.dirname, '..');
/** One line per decision, kept out of the repo's tracked files. The canary check reads it. */
const DEFAULT_LOG_DIR = join(REPO_ROOT, 'node_modules', '.cache');
/** Tests point this at a temporary file so they do not fill the log that the canary check reads. */
const LOG_FILE = process.env.QA_GUARD_LOG ?? join(DEFAULT_LOG_DIR, 'qa-guard.log');

/** Records a decision. A failure to log never changes the decision. */
function record(input, verdict) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    const tool = String(input?.tool_name);
    const detail = String(input?.tool_input?.command ?? input?.tool_input?.file_path ?? '').slice(
      0,
      200,
    );
    const line = `${new Date().toISOString()} ${verdict.allow ? 'ALLOW' : 'DENY'} ${tool} ${JSON.stringify(detail)} ${verdict.reason}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {
    // Logging is for the canary check only.
  }
}

function main() {
  let input;
  let verdict;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
    verdict = decide(input, REPO_ROOT);
  } catch (error) {
    stderr.write(`qa-guard: could not read the tool call, so it is blocked (${String(error)})\n`);
    return 2;
  }
  record(input, verdict);
  if (!verdict.allow) {
    stderr.write(`${verdict.reason}\n`);
    return 2;
  }
  stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `qa-guard: ${verdict.reason}`,
      },
    })}\n`,
  );
  return 0;
}

process.exitCode = main();
