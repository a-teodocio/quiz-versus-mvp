import { describe, expect, it } from 'vitest';
import { decide, decideCommand, decideRead, decideWrite } from './qa-guard-policy.mjs';

const ROOT = 'C:/Users/someone/work/quiz-versus-mvp';

/** A refusal must carry the guard's prefix and the reason it was refused for, not just any reason. */
function expectRefused(verdict, reason) {
  expect(verdict.allow).toBe(false);
  expect(verdict.reason).toMatch(/^qa-guard: /);
  expect(verdict.reason).toContain(reason);
}

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
    'npm run qa:browser -- --grep=J5.1',
    'npm run qa:ws -- --grep J5 --workers=1 --retries 0 --reporter=list',
    'npm run qa:ws -- --project chromium --repeat-each 2',
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
    ['chaining with &&', 'npm run check && git push', 'no chaining'],
    ['chaining with ;', 'npm run check; rm -rf .', 'no chaining'],
    ['a pipe', 'npm run check | tee out.txt', 'no chaining'],
    ['a redirect', 'npm run check > out.txt', 'no chaining'],
    ['an input redirect', 'npm run check < in.txt', 'no chaining'],
    ['command substitution', 'npm run check $(whoami)', 'no chaining'],
    ['backticks', 'curl http://localhost:1234/`whoami`', 'no chaining'],
    ['quotes', 'npm run qa:browser -- --grep "J1"', 'no chaining'],
    ['a glob', 'npm run qa:browser -- --grep J*', 'no chaining'],
    ['a newline', 'npm run check\ngit push', 'printable'],
    ['a tab', 'npm run\tcheck', 'printable'],
    ['a no-break space', 'npm run\u00a0check', 'printable'],
    ['a carriage return', 'npm run check\r', 'printable'],
    ['an install', 'npm install left-pad', 'of npm, only "npm run <script>"'],
    ['a clean install', 'npm ci', 'of npm, only "npm run <script>"'],
    ['an unlisted npm script', 'npm run build', 'is not one the tester may run'],
    ['a script named qa with nothing after', 'npm run qa:', 'is not one the tester may run'],
    ['an unlisted qa script', 'npm run qa:deploy', 'is not one the tester may run'],
    ['an upper-case script name', 'npm run CHECK', 'is not one the tester may run'],
    ['no script name', 'npm run', 'is not one the tester may run'],
    ['a prototype property as a script', 'npm run constructor', 'is not one the tester may run'],
    ['npx', 'npx playwright test', 'not a command'],
    ['node -e', 'node -e 1', 'not a command'],
    ['an unknown command says what is allowed', 'node -e 1', 'allowed: npm run'],
    ['node with a file', 'node scripts/make-core-fixtures.mjs', 'not a command'],
    ['git push', 'git push origin main', 'only git rev-parse'],
    ['git commit', 'git commit -m x', 'only git rev-parse'],
    ['git checkout', 'git checkout main', 'only git rev-parse'],
    ['git diff', 'git diff', 'only git rev-parse'],
    ['git log with a format', 'git log --oneline -5 --all', 'only git rev-parse'],
    ['taskkill by image name', 'taskkill /IM node.exe /F', 'not a command'],
    ['taskkill by pid (use qa:stop)', 'taskkill /PID 123', 'not a command'],
    ['pkill', 'pkill node', 'not a command'],
    ['Stop-Process', 'Stop-Process -Name node', 'not a command'],
    ['curl to another host', 'curl https://example.com', 'only call http://localhost'],
    ['curl to a look-alike host', 'curl http://localhost.evil.com:8787/', 'only call'],
    ['curl with userinfo', 'curl http://localhost:80@evil.com/', 'only call'],
    ['curl without a port', 'curl http://localhost/', 'only call'],
    ['curl to an IPv6 address', 'curl http://[::1]:8787/', 'no chaining'],
    ['curl with %-encoded host', 'curl http://%6c%6f%63%61%6c%68%6f%73%74:8787/', 'only call'],
    ['curl writing a file', 'curl -o out.txt http://localhost:8787/', 'only use -s'],
    ['curl with -sSo', 'curl -sSo out.txt http://localhost:8787/', 'only use -s'],
    ['curl with -O', 'curl -O http://localhost:8787/a', 'only use -s'],
    ['curl following redirects', 'curl -L http://localhost:8787/', 'only use -s'],
    ['curl with data', 'curl -d x http://localhost:8787/', 'only use -s'],
    ['curl with two query parameters', 'curl http://localhost:8787/a?x=1&y=2', 'no chaining'],
    ['a flag on a script that takes none', 'npm run lint -- --fix', 'takes no arguments'],
    ['-u on test', 'npm run test -- -u', 'takes no arguments'],
    ['--update on test', 'npm run test -- --update', 'takes no arguments'],
    ['arguments to check', 'npm run check -- --fix', 'takes no arguments'],
    ['arguments to qa:start', 'npm run qa:start -- --remote', 'takes no arguments'],
    [
      'an unlisted flag',
      'npm run qa:browser -- --update-snapshots',
      'is not one the tester may pass',
    ],
    ['-u on a test runner', 'npm run qa:ws -- -u', 'is not one the tester may pass'],
    [
      'a short flag with its value attached',
      'npm run qa:browser -- -cevil.config.ts',
      'is not one',
    ],
    ['-o with a path', 'npm run qa:browser -- -o/c/x', 'is not one'],
    ['--output', 'npm run qa:browser -- --output=/tmp/x', 'is not one'],
    ['--config', 'npm run qa:browser -- --config=evil.config.ts', 'is not one'],
    ['--root', 'npm run qa:ws -- --root=C:/x', 'is not one'],
    ['--reporter with a path', 'npm run qa:ws -- --reporter=./a.mjs', 'not allowed'],
    ['--reporter with a name outside the list', 'npm run qa:ws -- --reporter=html', 'not allowed'],
    ['--grep with a path', 'npm run qa:ws -- --grep ../x', 'not allowed'],
    ['--grep with a colon', 'npm run qa:ws -- --grep C:x', 'not allowed'],
    ['--grep with no value', 'npm run qa:ws -- --grep', 'missing or not allowed'],
    ['--workers with a large number', 'npm run qa:ws -- --workers=999', 'not allowed'],
    ['a flag value that is another flag', 'npm run qa:ws -- --grep --workers', 'not allowed'],
    ['arguments without --', 'npm run qa:browser --grep J1', 'after --'],
    ['an environment assignment', 'FOO=1 npm run check', 'not a command'],
    ['an absolute path to a program', '/usr/bin/curl http://localhost:8787/', 'not a command'],
    ['an empty command', '', 'empty'],
    ['whitespace only', '   ', 'empty'],
  ])('refuses %s', (_name, command, reason) => {
    expectRefused(decideCommand(command), reason);
  });

  it('refuses a command that is not text', () => {
    expectRefused(decideCommand(undefined), 'empty');
    expectRefused(decideCommand(42), 'empty');
  });
});

describe('files the tester may write', () => {
  it.each([
    `${ROOT}/e2e/qa/lobby.spec.ts`,
    `${ROOT}/e2e/qa/support/room.ts`,
    `${ROOT}/e2e/qa/fixtures/players.json`,
    `${ROOT}/packages/worker/test/qa/ties.test.ts`,
    'C:\\Users\\someone\\work\\quiz-versus-mvp\\e2e\\qa\\windows-style.spec.ts',
    '/c/Users/someone/work/quiz-versus-mvp/e2e/qa/git-bash-style.spec.ts',
    'C:/USERS/SOMEONE/WORK/QUIZ-VERSUS-MVP/e2e/qa/upper-case.spec.ts',
  ])('allows %s', (path) => {
    expect(decideWrite(path, ROOT).allow).toBe(true);
  });

  it.each([
    ['source code', `${ROOT}/packages/core/src/room/step.ts`, 'only e2e/qa/'],
    ['a worker source file', `${ROOT}/packages/worker/src/index.ts`, 'only e2e/qa/'],
    ['another package test folder', `${ROOT}/packages/core/test/x.test.ts`, 'only e2e/qa/'],
    ['the author-owned part of e2e', `${ROOT}/e2e/support/helpers.ts`, 'only e2e/qa/'],
    ['the e2e folder itself', `${ROOT}/e2e/playwright.config.ts`, 'only e2e/qa/'],
    ['package.json at the root', `${ROOT}/package.json`, 'only e2e/qa/'],
    ['the agent definition', `${ROOT}/.claude/agents/qa-tester.md`, 'only e2e/qa/'],
    ['the guard itself', `${ROOT}/scripts/qa-guard-policy.mjs`, 'only e2e/qa/'],
    ['the settings', `${ROOT}/.claude/settings.json`, 'only e2e/qa/'],
    [
      'a path that climbs out of e2e/qa',
      `${ROOT}/e2e/qa/../../packages/core/src/x.ts`,
      'only e2e/qa/',
    ],
    [
      'a path that climbs out of the repo',
      `${ROOT}/e2e/qa/../../../elsewhere/x.ts`,
      'inside the repository',
    ],
    ['a look-alike folder', `${ROOT}/e2e/qa-evil/x.ts`, 'only e2e/qa/'],
    [
      'a look-alike repo folder',
      'C:/Users/someone/work/quiz-versus-mvp-other/e2e/qa/x.ts',
      'inside the repository',
    ],
    ['another drive', 'D:/Users/someone/work/quiz-versus-mvp/e2e/qa/x.ts', 'inside the repository'],
    ['a file outside the repo', 'C:/Users/someone/Desktop/x.ts', 'inside the repository'],
    ['a relative path', 'e2e/qa/relative.spec.ts', 'absolute path'],
    ['a relative path that climbs', 'e2e/qa/../../scripts/x.ts', 'absolute path'],
    ['a UNC path', '//server/share/e2e/qa/x.ts', 'absolute path'],
    [
      'a device path',
      '\\\\?\\C:\\Users\\someone\\work\\quiz-versus-mvp\\e2e\\qa\\x.ts',
      'absolute path',
    ],
    ['a drive-relative path', 'C:e2e/qa/x.ts', 'absolute path'],
    [
      'a WSL path',
      '/mnt/c/Users/someone/work/quiz-versus-mvp/e2e/qa/x.ts',
      'inside the repository',
    ],
    ['an alternate data stream', `${ROOT}/e2e/qa/x.md:evil.ts`, 'hide where'],
    ['a stream on an allowed type', `${ROOT}/e2e/qa/x.ts::$DATA`, 'hide where'],
    ['a device name', `${ROOT}/e2e/qa/con.ts`, 'hide where'],
    ['a device name with an extension', `${ROOT}/e2e/qa/nul.test.ts`, 'hide where'],
    ['a short (8.3) name', `${ROOT}/e2e/qa/TESTSU~1.ts`, 'hide where'],
    ['a folder ending in a dot', `${ROOT}/e2e/qa/sub./x.ts`, 'hide where'],
    ['a folder ending in a space', `${ROOT}/e2e/qa/sub /x.ts`, 'hide where'],
    ['a file ending in a dot', `${ROOT}/e2e/qa/x.ts.`, 'hide where'],
    ['package.json inside qa', `${ROOT}/e2e/qa/package.json`, 'configures tools'],
    ['tsconfig inside qa', `${ROOT}/e2e/qa/tsconfig.json`, 'configures tools'],
    ['a tsconfig variant inside qa', `${ROOT}/e2e/qa/tsconfig.base.json`, 'configures tools'],
    ['node_modules inside qa', `${ROOT}/e2e/qa/node_modules/x/index.ts`, 'cannot be written'],
    ['a superscript device name', `${ROOT}/e2e/qa/com\u00b9.ts`, 'hide where'],
    ['a full-width name', `${ROOT}/e2e/qa/\uff58.ts`, 'hide where'],
    ['a name with a space', `${ROOT}/e2e/qa/two words.ts`, 'hide where'],
    ['a tool configuration file', `${ROOT}/e2e/qa/playwright.config.ts`, 'configures tools'],
    ['a vitest configuration file', `${ROOT}/e2e/qa/vitest.config.json`, 'configures tools'],
    ['a set-up file', `${ROOT}/e2e/qa/global-setup.ts`, 'configures tools'],
    ['a dot-file', `${ROOT}/e2e/qa/.prettierrc.json`, 'configures tools'],
    ['a markdown file', `${ROOT}/e2e/qa/notes.md`, 'only .ts and .json'],
    ['a nested CLAUDE.md', `${ROOT}/e2e/qa/CLAUDE.md`, 'configures tools'],
    ['a module script', `${ROOT}/e2e/qa/run.mjs`, 'only .ts and .json'],
    ['a shell script', `${ROOT}/e2e/qa/run.sh`, 'only .ts and .json'],
    ['a batch file', `${ROOT}/e2e/qa/run.cmd`, 'only .ts and .json'],
    ['a file with no extension', `${ROOT}/e2e/qa/Makefile`, 'only .ts and .json'],
    ['a path with a control character', `${ROOT}/e2e/qa/x.ts\0.md`, 'absolute path'],
    ['an empty path', '', 'absolute path'],
  ])('refuses %s', (_name, path, reason) => {
    expectRefused(decideWrite(path, ROOT), reason);
  });

  it('refuses a path that is not text', () => {
    expectRefused(decideWrite(undefined, ROOT), 'absolute path');
  });
});

describe('what the tester may read and search', () => {
  const CWD = ROOT;

  it.each([
    ['Read', { file_path: `${ROOT}/docs/protocol.md` }],
    ['Read', { file_path: `${ROOT}/e2e/qa/test-results/a.png` }],
    ['Grep', { pattern: 'x', path: `${ROOT}/docs` }],
    ['Grep', { pattern: 'x' }],
    ['Grep', { pattern: 'x', glob: '*.ts' }],
    ['Glob', { pattern: '**/*.ts' }],
    ['Glob', { pattern: '*.md', path: `${ROOT}/docs` }],
    ['Read', { file_path: '/c/Users/someone/work/quiz-versus-mvp/docs/protocol.md' }],
    ['Grep', { pattern: '..', glob: '*.ts' }],
    ['Grep', { pattern: '.git|.env', path: `${ROOT}/docs` }],
    ['Glob', { pattern: '.github/**' }],
    ['Glob', { pattern: '.gitignore' }],
    ['Glob', { pattern: '**/*.keyboard.spec.ts' }],
    ['Glob', { pattern: '**/lobby.environment.ts' }],
    ['Glob', { pattern: '**/*.keys.json' }],
    ['Read', { file_path: `${ROOT}/.github/pull_request_template.md` }],
    ['Read', { file_path: `${ROOT}/.gitignore` }],
  ])('allows %s %j', (tool, input) => {
    expect(decideRead(tool, input, CWD, ROOT).allow).toBe(true);
  });

  it.each([
    [
      'Read',
      { file_path: 'C:/Users/someone/obsidian/vault/notes/course.md' },
      'inside the repository',
    ],
    ['Read', { file_path: `${ROOT}/../other/x.md` }, 'inside the repository'],
    ['Read', { file_path: 'docs/protocol.md' }, 'absolute path'],
    ['Read', {}, 'absolute path'],
    ['Grep', { pattern: 'x', path: 'C:/Users/someone/obsidian' }, 'inside the repository'],
    ['Glob', { pattern: '*.md', path: 'C:/Users/someone/obsidian' }, 'inside the repository'],
    ['Glob', { pattern: 'C:/Users/**/*.md' }, 'stay inside'],
    ['Glob', { pattern: '/c/Users/**/*.md' }, 'stay inside'],
    ['Glob', { pattern: '../**/*.md' }, 'stay inside'],
    ['Glob', { pattern: 'docs/../../x/*.md' }, 'stay inside'],
    ['Grep', { pattern: 'x', glob: '../**' }, 'stay inside'],
    ['Glob', { pattern: '{..,x}/*.md' }, 'stay inside'],
    ['Glob', { pattern: '~/x/*.md' }, 'stay inside'],
    ['Grep', { pattern: 'x', glob: '~/**' }, 'stay inside'],
    [
      'Grep',
      { pattern: 'x', path: 'D:/Users/someone/work/quiz-versus-mvp' },
      'inside the repository',
    ],
    [
      'Glob',
      { pattern: '*', path: 'D:/Users/someone/work/quiz-versus-mvp' },
      'inside the repository',
    ],
    ['Read', { file_path: `${ROOT}/.dev.vars` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/packages/worker/.dev.vars.local` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/.env` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/.env.production` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/.git/config` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/node_modules/.cache/qa-guard.log` }, 'secrets'],
    ['Grep', { pattern: 'x', path: `${ROOT}/.git` }, 'secrets'],
    ['Glob', { pattern: '*', path: `${ROOT}/node_modules/.cache` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/packages/worker/.wrangler/state/x.sqlite` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/keys/server.pem` }, 'secrets'],
    ['Read', { file_path: `${ROOT}/keys/server.key` }, 'secrets'],
    ['Glob', { pattern: '**/*.pem' }, 'secrets'],
    ['Glob', { pattern: '**/*.key' }, 'secrets'],
    ['Glob', { pattern: '*.{pem,key}' }, 'braces, brackets or question marks'],
    ['Glob', { pattern: '*.p[e]m' }, 'braces, brackets or question marks'],
    ['Glob', { pattern: '**/*.pem*' }, 'secrets'],
    ['Glob', { pattern: '**/.envrc' }, 'secrets'],
    ['Glob', { pattern: '**/*.environment.*' }, 'secrets'],
    ['Grep', { pattern: 'x', glob: '*.{ts,tsx}' }, 'braces, brackets or question marks'],
    ['Glob', { pattern: '.git*' }, 'secrets'],
    ['Glob', { pattern: '.wrangler?' }, 'braces, brackets or question marks'],
    ['Glob', { pattern: '.git[/]config' }, 'braces, brackets or question marks'],
    ['Glob', { pattern: '**/.env' }, 'secrets'],
    ['Glob', { pattern: '**/{.env,docs}' }, 'braces, brackets or question marks'],
    ['Glob', { pattern: '**/.wrangler/**' }, 'secrets'],
    ['Glob', { pattern: '**/.dev.vars' }, 'secrets'],
    ['Glob', { pattern: '**/.env*' }, 'secrets'],
    ['Glob', { pattern: '{.git,docs}/*' }, 'braces, brackets or question marks'],
    ['Grep', { pattern: 'x', glob: '.git/**' }, 'secrets'],
  ])('refuses %s %j', (tool, input, reason) => {
    expectRefused(decideRead(tool, input, CWD, ROOT), reason);
  });

  it('refuses a search with no path when the working directory is outside the repo', () => {
    const elsewhere = 'C:/Users/someone/obsidian/vault';
    expectRefused(decideRead('Grep', { pattern: 'x' }, elsewhere, ROOT), 'inside the repository');
    expectRefused(
      decideRead('Glob', { pattern: '*.md' }, elsewhere, ROOT),
      'inside the repository',
    );
  });

  it('refuses a search with no path and no working directory', () => {
    expectRefused(decideRead('Grep', { pattern: 'x' }, undefined, ROOT), 'absolute path');
  });
});

describe('a whole tool call', () => {
  it('routes Bash to the command rules', () => {
    const bash = (command, cwd = ROOT) => ({ tool_name: 'Bash', tool_input: { command }, cwd });
    expect(decide(bash('npm run check'), ROOT).allow).toBe(true);
    expect(decide(bash('npm run check', `${ROOT}/docs`), ROOT).allow).toBe(true);
    expect(
      decide(bash('npm run check', 'C:\\Users\\someone\\work\\quiz-versus-mvp'), ROOT).allow,
    ).toBe(true);
    expect(
      decide(bash('npm run check', 'C:\\Users\\someone\\work\\quiz-versus-mvp\\docs'), ROOT).allow,
    ).toBe(true);
    expectRefused(decide(bash('git push'), ROOT), 'only git rev-parse');
  });

  it.each([
    ['another project', 'C:/Users/someone/obsidian/vault'],
    ['a look-alike folder', 'C:/Users/someone/work/quiz-versus-mvp-other'],
    ['another drive', 'D:/Users/someone/work/quiz-versus-mvp'],
    ['a relative folder', 'docs'],
    ['no folder', undefined],
  ])('refuses a Bash command run from %s, even a permitted one', (_name, cwd) => {
    const input = { tool_name: 'Bash', tool_input: { command: 'npm run check' }, cwd };
    expectRefused(decide(input, ROOT), 'inside the repository');
  });

  it.each(['Write', 'Edit', 'MultiEdit'])('routes %s to the path rules', (tool) => {
    expect(
      decide({ tool_name: tool, tool_input: { file_path: `${ROOT}/e2e/qa/a.spec.ts` } }, ROOT)
        .allow,
    ).toBe(true);
    expectRefused(
      decide({ tool_name: tool, tool_input: { file_path: `${ROOT}/package.json` } }, ROOT),
      'only e2e/qa/',
    );
  });

  it.each(['Read', 'Grep', 'Glob'])('routes %s to the read rules', (tool) => {
    const outside = {
      tool_name: tool,
      tool_input: { file_path: 'C:/x/y.md', path: 'C:/x' },
      cwd: ROOT,
    };
    expectRefused(decide(outside, ROOT), 'inside the repository');
  });

  it.each(['PowerShell', 'WebFetch', 'NotebookEdit', 'Agent', 'Monitor', undefined, 7])(
    'refuses any other tool (%s)',
    (tool) => {
      expectRefused(
        decide({ tool_name: tool, tool_input: {} }, ROOT),
        'not one the tester may use',
      );
    },
  );

  it('refuses input that is missing or malformed', () => {
    expect(decide(undefined, ROOT).allow).toBe(false);
    expect(decide(null, ROOT).allow).toBe(false);
    expect(decide({ tool_name: 'Bash' }, ROOT).allow).toBe(false);
    expect(decide({ tool_name: 'Write', tool_input: {} }, ROOT).allow).toBe(false);
  });
});

describe('on a POSIX machine (the paths on the continuous integration runner)', () => {
  const POSIX_ROOT = '/home/runner/work/quiz-versus-mvp/quiz-versus-mvp';

  it.each([
    `${POSIX_ROOT}/e2e/qa/lobby.spec.ts`,
    `${POSIX_ROOT}/packages/worker/test/qa/ties.test.ts`,
  ])('allows writing %s', (path) => {
    expect(decideWrite(path, POSIX_ROOT).allow).toBe(true);
  });

  it.each([
    ['source code', `${POSIX_ROOT}/packages/core/src/x.ts`, 'only e2e/qa/'],
    ['a file outside the repo', '/etc/passwd', 'inside the repository'],
    [
      'a sibling folder',
      '/home/runner/work/quiz-versus-mvp/other/e2e/qa/x.ts',
      'inside the repository',
    ],
    ['a look-alike repo folder', `${POSIX_ROOT}-other/e2e/qa/x.ts`, 'inside the repository'],
    ['a path that climbs out', `${POSIX_ROOT}/e2e/qa/../../../x.ts`, 'inside the repository'],
    [
      'a Windows path',
      'C:/Users/someone/work/quiz-versus-mvp/e2e/qa/x.ts',
      'inside the repository',
    ],
    ['a UNC path', '//server/share/e2e/qa/x.ts', 'absolute path'],
    ['a relative path', 'e2e/qa/x.ts', 'absolute path'],
  ])('refuses writing %s', (_name, path, reason) => {
    expectRefused(decideWrite(path, POSIX_ROOT), reason);
  });

  it('keeps reads, searches and commands inside the repo', () => {
    const read = (file) => decideRead('Read', { file_path: file }, POSIX_ROOT, POSIX_ROOT);
    expect(read(`${POSIX_ROOT}/docs/protocol.md`).allow).toBe(true);
    expectRefused(read('/home/runner/.ssh/id_rsa'), 'inside the repository');
    expectRefused(read(`${POSIX_ROOT}/.dev.vars`), 'secrets');
    const bash = (cwd) => ({ tool_name: 'Bash', tool_input: { command: 'npm run check' }, cwd });
    expect(decide(bash(POSIX_ROOT), POSIX_ROOT).allow).toBe(true);
    expect(decide(bash(`${POSIX_ROOT}/docs`), POSIX_ROOT).allow).toBe(true);
    expectRefused(decide(bash('/home/runner'), POSIX_ROOT), 'inside the repository');
    expectRefused(decide(bash('C:/Users/someone'), POSIX_ROOT), 'inside the repository');
  });
});

describe('where the two path forms could be confused', () => {
  const POSIX_ROOT = '/home/runner/work/quiz-versus-mvp/quiz-versus-mvp';
  const LETTER_ROOT = '/c/code/repo';

  it('compares the part that names the repo exactly under a POSIX root (the file system is case-sensitive)', () => {
    expectRefused(
      decideWrite('/home/runner/work/Quiz-Versus-MVP/quiz-versus-mvp/e2e/qa/x.ts', POSIX_ROOT),
      'inside the repository',
    );
    expectRefused(
      decideWrite('/HOME/runner/work/quiz-versus-mvp/quiz-versus-mvp/e2e/qa/x.ts', POSIX_ROOT),
      'inside the repository',
    );
  });

  it('still ignores case below the repo, where the writable-folder and secret rules need it', () => {
    expect(decideWrite(`${POSIX_ROOT}/E2E/QA/Lobby.spec.ts`, POSIX_ROOT).allow).toBe(true);
    expectRefused(
      decideRead('Read', { file_path: `${POSIX_ROOT}/.DEV.VARS` }, POSIX_ROOT, POSIX_ROOT),
      'secrets',
    );
  });

  it('does not read a POSIX folder named with one letter as a drive', () => {
    expect(decideWrite(`${LETTER_ROOT}/e2e/qa/x.ts`, LETTER_ROOT).allow).toBe(true);
    expectRefused(decideWrite('C:/code/repo/e2e/qa/x.ts', LETTER_ROOT), 'inside the repository');
    expectRefused(
      decideWrite('c:\\code\\repo\\e2e\\qa\\x.ts', LETTER_ROOT),
      'inside the repository',
    );
  });

  it('still reads the Git Bash spelling of a drive path when the repo is on a drive', () => {
    const root = 'C:\\Users\\someone\\work\\Repo';
    expect(decideWrite('/c/users/someone/work/repo/e2e/qa/x.ts', root).allow).toBe(true);
    expect(decideWrite('C:/Users/someone/work/REPO/e2e/qa/x.ts', root).allow).toBe(true);
  });

  it('searches from the working directory on a POSIX machine when no path is given', () => {
    expect(decideRead('Grep', { pattern: 'x' }, POSIX_ROOT, POSIX_ROOT).allow).toBe(true);
    expectRefused(
      decideRead('Grep', { pattern: 'x' }, '/home/runner', POSIX_ROOT),
      'inside the repository',
    );
    expectRefused(decideRead('Glob', { pattern: '*.md' }, undefined, POSIX_ROOT), 'absolute path');
  });
});
