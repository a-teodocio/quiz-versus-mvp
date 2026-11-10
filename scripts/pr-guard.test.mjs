import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execPath } from 'node:process';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(import.meta.dirname, 'pr-guard.mjs');
const SETTINGS_FILE = join(REPO_ROOT, '.claude', 'settings.json');

/** Runs the real hook script as the harness would: JSON on stdin, exit code and output back. */
function runHook(stdin) {
  const result = spawnSync(execPath, [SCRIPT], { input: stdin, encoding: 'utf8', timeout: 10_000 });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const call = (tool_name, command) => JSON.stringify({ tool_name, tool_input: { command } });

describe('the pr-guard hook as a process', () => {
  it('lets an allowed command through with exit 0 and prints nothing, so no prompt is skipped', () => {
    const result = runHook(call('Bash', 'gh pr create --draft --title t --body-file b.md'));
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });

  it('lets a command without gh through the same way', () => {
    expect(runHook(call('PowerShell', 'npm run check'))).toMatchObject({ code: 0, stdout: '' });
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
