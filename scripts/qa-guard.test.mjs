import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { execPath } from 'node:process';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, 'qa-guard.mjs');

/** Runs the real hook script as the harness would: JSON on stdin, exit code and output back. */
function runHook(stdin) {
  const result = spawnSync(execPath, [SCRIPT], { input: stdin, encoding: 'utf8', timeout: 10_000 });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const call = (tool_name, tool_input) => JSON.stringify({ tool_name, tool_input });

describe('the qa-guard hook as a process', () => {
  it('allows a permitted command with exit 0 and an allow decision', () => {
    const result = runHook(call('Bash', { command: 'npm run check' }));
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    });
  });

  it('allows a write inside the test folder, using the repo root it lives in', () => {
    const result = runHook(call('Write', { file_path: 'e2e/lobby.spec.ts' }));
    expect(result.code).toBe(0);
  });

  it('blocks a forbidden command with exit 2 and the reason on stderr', () => {
    const result = runHook(call('Bash', { command: 'git push origin main' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('qa-guard:');
    expect(result.stdout).toBe('');
  });

  it('blocks a write outside the test folders', () => {
    const result = runHook(call('Edit', { file_path: 'packages/core/src/index.ts' }));
    expect(result.code).toBe(2);
  });

  it.each([
    ['empty input', ''],
    ['text that is not JSON', 'not json'],
    ['JSON that is not an object', '42'],
    ['JSON null', 'null'],
    ['a call with no tool name', '{}'],
  ])('fails closed on %s', (_name, stdin) => {
    const result = runHook(stdin);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('qa-guard:');
  });
});
