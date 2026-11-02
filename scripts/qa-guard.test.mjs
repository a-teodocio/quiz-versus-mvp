import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process, { execPath } from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(import.meta.dirname, 'qa-guard.mjs');
/** The tests write their decisions here, not to the log that the canary check reads. */
const LOG_FILE = join(tmpdir(), `qa-guard-test-${String(process.pid)}.log`);
const AGENT_FILE = join(REPO_ROOT, '.claude', 'agents', 'qa-tester.md');

/** Runs the real hook script as the harness would: JSON on stdin, exit code and output back. */
function runHook(stdin) {
  const result = spawnSync(execPath, [SCRIPT], {
    input: stdin,
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, QA_GUARD_LOG: LOG_FILE },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const call = (tool_name, tool_input, cwd = REPO_ROOT) =>
  JSON.stringify({ tool_name, tool_input, cwd });

afterAll(() => {
  rmSync(LOG_FILE, { force: true });
});

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

  it('allows a write inside the tester folder, given as the real absolute path (backslashes on Windows)', () => {
    const file = join(REPO_ROOT, 'e2e', 'qa', 'lobby.spec.ts');
    expect(runHook(call('Write', { file_path: file })).code).toBe(0);
  });

  it('allows reading a file in the repo by its real absolute path', () => {
    const file = join(REPO_ROOT, 'docs', 'protocol.md');
    expect(runHook(call('Read', { file_path: file })).code).toBe(0);
  });

  it('blocks a permitted command when the session was started outside the repo', () => {
    const result = runHook(call('Bash', { command: 'npm run check' }, join(REPO_ROOT, '..')));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('inside the repository');
  });

  it('blocks a forbidden command with exit 2 and the reason on stderr', () => {
    const result = runHook(call('Bash', { command: 'git push origin main' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('qa-guard:');
    expect(result.stdout).toBe('');
  });

  it('blocks a write outside the tester folder, a relative path, and a read outside the repo', () => {
    const source = join(REPO_ROOT, 'packages', 'core', 'src', 'index.ts');
    expect(runHook(call('Edit', { file_path: source })).code).toBe(2);
    expect(runHook(call('Write', { file_path: 'e2e/qa/x.spec.ts' })).code).toBe(2);
    expect(runHook(call('Read', { file_path: join(REPO_ROOT, '..', 'elsewhere.md') })).code).toBe(
      2,
    );
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

  it('writes a log line for every decision, so a canary check can prove the hook ran', () => {
    const marker = `npm run check -- --marker-${String(Date.now())}`;
    runHook(call('Bash', { command: marker }));
    const log = readFileSync(LOG_FILE, 'utf8').split('\n');
    const line = log.find((entry) => entry.includes(marker));
    expect(line).toMatch(/ DENY Bash /);
    runHook(call('Bash', { command: 'npm run lint' }));
    expect(readFileSync(LOG_FILE, 'utf8')).toMatch(/ ALLOW Bash "npm run lint"/);
  });
});

describe('the hook wiring in the agent definition', () => {
  const text = readFileSync(AGENT_FILE, 'utf8');
  const frontmatter = text.split('---')[1] ?? '';

  it('runs the guard on every tool it must control, and only those are given to the agent', () => {
    const matcher = /matcher:\s*'([^']+)'/.exec(frontmatter)?.[1] ?? '';
    const guarded = matcher.split('|').sort();
    expect(guarded).toEqual(['Bash', 'Edit', 'Glob', 'Grep', 'MultiEdit', 'Read', 'Write']);
    const tools = (/^tools:\s*(.+)$/m.exec(frontmatter)?.[1] ?? '').split(/,\s*/);
    for (const tool of tools) expect(guarded).toContain(tool);
  });

  it('turns any failure to start the guard into a block, whichever shell runs the command', () => {
    const command = /command:\s*'([^']+)'/.exec(frontmatter)?.[1] ?? '';
    expect(command).toContain('scripts/qa-guard.mjs');
    expect(command).toMatch(/\|\| exit 2$/);
  });

  it('never lists a tool as both kept and removed', () => {
    const tools = (/^tools:\s*(.+)$/m.exec(frontmatter)?.[1] ?? '').split(/,\s*/);
    const removed = (/^disallowedTools:\s*(.+)$/m.exec(frontmatter)?.[1] ?? '').split(/,\s*/);
    expect(tools.filter((tool) => removed.includes(tool))).toEqual([]);
  });

  it('removes the tools that could get round the guard', () => {
    const removed = (/^disallowedTools:\s*(.+)$/m.exec(frontmatter)?.[1] ?? '').split(/,\s*/);
    for (const tool of ['PowerShell', 'WebFetch', 'WebSearch', 'Agent', 'Skill', 'NotebookEdit']) {
      expect(removed).toContain(tool);
    }
  });
});
