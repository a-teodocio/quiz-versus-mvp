import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process, { execPath } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(import.meta.dirname, 'pr-guard.mjs');
const SETTINGS_FILE = join(REPO_ROOT, '.claude', 'settings.json');
/** The tests log here, not to the log the canary check reads. */
const LOG_FILE = join(tmpdir(), `pr-guard-test-${String(process.pid)}.log`);

/** Runs the real hook script as the harness would: JSON on stdin, exit code and output back. */
function runHook(stdin) {
  const result = spawnSync(execPath, [SCRIPT], {
    input: stdin,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, PR_GUARD_LOG: LOG_FILE },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const call = (tool_name, command) => JSON.stringify({ tool_name, tool_input: { command } });
const readLog = () => (existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : '');

afterEach(() => {
  rmSync(LOG_FILE, { force: true });
});

describe('the pr-guard hook as a process', () => {
  it('lets an allowed gh command through with exit 0 and prints nothing, so no prompt is skipped', () => {
    const result = runHook(call('Bash', 'gh pr create --draft --title t --body-file b.md'));
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });

  it('lets a command without gh through the same way, in the Bash and the PowerShell tool', () => {
    expect(runHook(call('Bash', 'npm run check'))).toMatchObject({ code: 0, stdout: '' });
    expect(runHook(call('PowerShell', 'Get-ChildItem'))).toMatchObject({ code: 0, stdout: '' });
  });

  it('blocks a refused command with exit 2 and the reason on stderr', () => {
    const result = runHook(call('PowerShell', 'gh pr ready 35'));
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('only the owner marks a pull request ready');
  });

  it('blocks when the tool call is not JSON', () => {
    const result = runHook('not json');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('could not read the tool call');
  });

  it('logs every command that mentions gh, allowed or refused, and nothing else', () => {
    runHook(call('Bash', 'npm run check'));
    runHook(call('Bash', 'gh pr view 3'));
    runHook(call('PowerShell', 'gh pr merge 3'));
    const lines = readLog().trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/ ALLOW Bash "gh pr view 3" gh command on the list$/);
    expect(lines[1]).toMatch(/ DENY PowerShell "gh pr merge 3" pr-guard: the author never merges/);
  });
});

describe('the wiring in .claude/settings.json', () => {
  it('runs the hook before every Bash and PowerShell call, and blocks if it cannot start', () => {
    const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    const entries = settings.hooks.PreToolUse;
    const entry = entries.find((candidate) =>
      candidate.hooks.some((hook) => hook.command.includes('scripts/pr-guard.mjs')),
    );
    expect(entry.matcher.split('|').sort()).toEqual(['Bash', 'PowerShell']);
    expect(entry.hooks).toEqual([
      {
        type: 'command',
        command: 'node "$CLAUDE_PROJECT_DIR/scripts/pr-guard.mjs" || exit 2',
      },
    ]);
  });
});
