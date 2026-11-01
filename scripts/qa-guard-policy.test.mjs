import { describe, expect, it } from 'vitest';
import { decide, decideCommand, decideWrite } from './qa-guard-policy.mjs';

const ROOT = 'C:/Users/someone/work/quiz-versus-mvp';

describe('commands the tester may run', () => {
  it.each([
    'npm run check',
    'npm run test',
    'npm run lint',
    'npm run typecheck',
    'npm run qa:start',
    'npm run qa:stop',
    'npm run qa:browser',
    'npm run qa:browser -- --grep J1',
    'npm run qa:ws -- --grep J5 --workers=1',
    'curl http://localhost:8787/health',
    'curl -s -i http://127.0.0.1:8787/rooms/abc?x=1',
    'curl -sS --max-time 5 http://localhost:5173/',
    'git rev-parse HEAD',
    'git rev-parse --short HEAD',
    'git status --short',
    'git log --oneline -5',
  ])('allows %s', (command) => {
    expect(decideCommand(command).allow).toBe(true);
  });
});

describe('commands that are refused', () => {
  it.each([
    ['chaining with &&', 'npm run check && git push'],
    ['chaining with ;', 'npm run check; rm -rf .'],
    ['a pipe', 'npm run check | tee out.txt'],
    ['a redirect', 'npm run check > out.txt'],
    ['an input redirect', 'npm run check < in.txt'],
    ['command substitution', 'npm run check $(whoami)'],
    ['backticks', 'curl http://localhost:1234/`whoami`'],
    ['a newline', 'npm run check\ngit push'],
    ['quotes', 'npm run qa:browser -- --grep "J1"'],
    ['a glob', 'npm run qa:browser -- --grep J*'],
    ['an install', 'npm install left-pad'],
    ['a clean install', 'npm ci'],
    ['an unlisted npm script', 'npm run build'],
    ['an unlisted qa-like script', 'npm run qa'],
    ['npx', 'npx playwright test'],
    ['node -e', 'node -e 1'],
    ['node with a file', 'node scripts/make-core-fixtures.mjs'],
    ['git push', 'git push origin main'],
    ['git commit', 'git commit -m x'],
    ['git checkout', 'git checkout main'],
    ['git diff (not in the short list)', 'git diff'],
    ['taskkill by image name', 'taskkill /IM node.exe /F'],
    ['taskkill by pid (use qa:stop)', 'taskkill /PID 123'],
    ['pkill', 'pkill node'],
    ['Stop-Process', 'Stop-Process -Name node'],
    ['curl to another host', 'curl https://example.com'],
    ['curl to a look-alike host', 'curl http://localhost.evil.com:8787/'],
    ['curl with userinfo', 'curl http://localhost:80@evil.com/'],
    ['curl without a port', 'curl http://localhost/'],
    ['curl writing a file', 'curl -o out.txt http://localhost:8787/'],
    ['curl with -O', 'curl -O http://localhost:8787/a'],
    ['curl with data from a file', 'curl -d @secret http://localhost:8787/'],
    ['an output flag', 'npm run qa:browser -- --output=/tmp/x'],
    ['-o', 'npm run qa:browser -- -o /tmp/x'],
    ['a config flag', 'npm run qa:browser -- --config=evil.config.ts'],
    ['a parent path in an argument', 'npm run qa:browser -- ../../x'],
    ['arguments without --', 'npm run qa:browser --grep J1'],
    ['an environment assignment', 'FOO=1 npm run check'],
    ['an absolute path to a program', '/usr/bin/curl http://localhost:8787/'],
    ['an empty command', ''],
    ['whitespace only', '   '],
  ])('refuses %s', (_name, command) => {
    const verdict = decideCommand(command);
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('qa-guard:');
  });

  it('refuses a command that is not text', () => {
    expect(decideCommand(undefined).allow).toBe(false);
    expect(decideCommand(42).allow).toBe(false);
  });
});

describe('files the tester may write', () => {
  it.each([
    `${ROOT}/e2e/lobby.spec.ts`,
    `${ROOT}/e2e/support/room.ts`,
    `${ROOT}/e2e/fixtures/players.json`,
    `${ROOT}/packages/worker/test/qa/ties.test.ts`,
    'e2e/relative.spec.ts',
    'C:\\Users\\someone\\work\\quiz-versus-mvp\\e2e\\windows-style.spec.ts',
    '/c/Users/someone/work/quiz-versus-mvp/e2e/git-bash-style.spec.ts',
    'C:/USERS/SOMEONE/WORK/QUIZ-VERSUS-MVP/e2e/upper-case.spec.ts',
  ])('allows %s', (path) => {
    expect(decideWrite(path, ROOT).allow).toBe(true);
  });

  it.each([
    ['source code', `${ROOT}/packages/core/src/room/step.ts`],
    ['a worker source file', `${ROOT}/packages/worker/src/index.ts`],
    ["a test folder that is not the tester's", `${ROOT}/packages/core/test/x.test.ts`],
    ['package.json', `${ROOT}/package.json`],
    ['the agent definition', `${ROOT}/.claude/agents/qa-tester.md`],
    ['the guard itself', `${ROOT}/scripts/qa-guard-policy.mjs`],
    ['the settings', `${ROOT}/.claude/settings.json`],
    ['a path that climbs out of e2e', `${ROOT}/e2e/../packages/core/src/x.ts`],
    ['a relative path that climbs out of e2e', 'e2e/../scripts/x.mjs'],
    ['a path that climbs out of the repo', `${ROOT}/e2e/../../elsewhere/x.ts`],
    ['a look-alike folder', `${ROOT}/e2e-evil/x.ts`],
    ['a look-alike repo folder', 'C:/Users/someone/work/quiz-versus-mvp-other/e2e/x.ts'],
    ['a file outside the repo', 'C:/Users/someone/Desktop/x.ts'],
    ['a shell script in e2e', `${ROOT}/e2e/run.sh`],
    ['a batch file in e2e', `${ROOT}/e2e/run.cmd`],
    ['a file with no extension', `${ROOT}/e2e/Makefile`],
    ['a path with a null byte', `${ROOT}/e2e/x.ts\0.md`],
    ['an empty path', ''],
  ])('refuses %s', (_name, path) => {
    const verdict = decideWrite(path, ROOT);
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('qa-guard:');
  });

  it('refuses a path that is not text', () => {
    expect(decideWrite(undefined, ROOT).allow).toBe(false);
  });
});

describe('a whole tool call', () => {
  it('routes Bash to the command rules', () => {
    expect(
      decide({ tool_name: 'Bash', tool_input: { command: 'npm run check' } }, ROOT).allow,
    ).toBe(true);
    expect(decide({ tool_name: 'Bash', tool_input: { command: 'git push' } }, ROOT).allow).toBe(
      false,
    );
  });

  it.each(['Write', 'Edit', 'MultiEdit'])('routes %s to the path rules', (tool) => {
    expect(
      decide({ tool_name: tool, tool_input: { file_path: `${ROOT}/e2e/a.spec.ts` } }, ROOT).allow,
    ).toBe(true);
    expect(
      decide({ tool_name: tool, tool_input: { file_path: `${ROOT}/package.json` } }, ROOT).allow,
    ).toBe(false);
  });

  it.each(['PowerShell', 'WebFetch', 'NotebookEdit', 'Agent', 'Monitor', undefined, 7])(
    'refuses any other tool (%s)',
    (tool) => {
      expect(decide({ tool_name: tool, tool_input: {} }, ROOT).allow).toBe(false);
    },
  );

  it('refuses input that is missing or malformed', () => {
    expect(decide(undefined, ROOT).allow).toBe(false);
    expect(decide(null, ROOT).allow).toBe(false);
    expect(decide({ tool_name: 'Bash' }, ROOT).allow).toBe(false);
    expect(decide({ tool_name: 'Write', tool_input: {} }, ROOT).allow).toBe(false);
  });
});
