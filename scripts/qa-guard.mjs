// PreToolUse hook for the qa-tester subagent (see .claude/agents/qa-tester.md).
// Reads the tool call as JSON on stdin, applies scripts/qa-guard-policy.mjs, and either allows the
// call or blocks it with a reason the agent can read. It fails closed: any problem blocks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit, stderr, stdout } from 'node:process';
import { decide } from './qa-guard-policy.mjs';

const REPO_ROOT = join(import.meta.dirname, '..');

function block(reason) {
  stderr.write(`${reason}\n`);
  exit(2);
}

let verdict;
try {
  verdict = decide(JSON.parse(readFileSync(0, 'utf8')), REPO_ROOT);
} catch {
  block('qa-guard: could not read the tool call, so it is blocked');
}

if (!verdict.allow) block(verdict.reason);

stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `qa-guard: ${verdict.reason}`,
    },
  })}\n`,
);
