// The rules the qa-tester subagent is held to. Pure functions, so they can be tested.
//
// The tester may run only a few exact command shapes and may write only inside the test
// folders below. Everything else is refused. The hook script (scripts/qa-guard.mjs) applies this
// policy to every Bash, Write and Edit call the tester makes. See .claude/agents/qa-tester.md.
import { posix } from 'node:path';

/** Folders the tester may write to, relative to the repo root. Tests and their fixtures only. */
export const WRITABLE_DIRS = ['e2e/', 'packages/worker/test/qa/'];
const WRITABLE_EXTENSIONS = ['.ts', '.mjs', '.json', '.md'];

/** `npm run <name>` scripts the tester may start, besides anything named `qa:...`. */
const NPM_SCRIPTS = ['check', 'test', 'lint', 'typecheck'];

/** Characters that let a command do more than one thing, or something other than it reads as. */
const SHELL_SYNTAX = /[;&|`$<>(){}[\]\\"'*\n\r]/;

/** Arguments that would point a tool's output or configuration somewhere else. */
const FORBIDDEN_ARGUMENTS =
  /^(-o|-c|--output\S*|--config\S*|--user-data-dir\S*|--update-snapshots)$/;

const ARGUMENT_CHARACTERS = /^[A-Za-z0-9_.:=/@-]+$/;
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}(\/[A-Za-z0-9._~/?&=%-]*)?$/;

const allow = (reason) => ({ allow: true, reason });
const deny = (reason) => ({ allow: false, reason: `qa-guard: ${reason}` });

/** `npm run check`, or `npm run qa:<name>` with optional arguments after `--`. */
function checkNpm(words) {
  if (words[0] !== 'npm' || words[1] !== 'run' || words[2] === undefined) return null;
  const script = words[2];
  const known = NPM_SCRIPTS.includes(script) || /^qa:[a-z0-9:-]+$/.test(script);
  if (!known) return deny(`npm script "${script}" is not one the tester may run`);
  const rest = words.slice(3);
  if (rest.length === 0) return allow(`npm run ${script}`);
  if (rest[0] !== '--') return deny('npm arguments must come after --');
  for (const argument of rest.slice(1)) {
    if (!ARGUMENT_CHARACTERS.test(argument) || argument.includes('..')) {
      return deny(`argument "${argument}" has characters that are not allowed`);
    }
    if (FORBIDDEN_ARGUMENTS.test(argument.split('=')[0] ?? '')) {
      return deny(`argument "${argument}" could move output or configuration`);
    }
  }
  return allow(`npm run ${script} with arguments`);
}

/** `curl` to this machine only, read-only, no files. */
function checkCurl(words) {
  if (words[0] !== 'curl') return null;
  const url = words.at(-1) ?? '';
  const options = words.slice(1, -1);
  const optionOk = (option, at) =>
    /^-[sSiI]+$/.test(option) ||
    option === '--max-time' ||
    (/^\d+$/.test(option) && options[at - 1] === '--max-time');
  if (!options.every(optionOk)) return deny('curl may only use -s, -S, -i, -I and --max-time');
  if (!LOCAL_URL.test(url)) return deny('curl may only call http://localhost or http://127.0.0.1');
  return allow('curl to localhost');
}

/** A few read-only git commands, to learn which commit is under test. */
function checkGit(words) {
  if (words[0] !== 'git') return null;
  const line = words.join(' ');
  const readOnly = [
    /^git rev-parse( --short)? HEAD$/,
    /^git status --short$/,
    /^git log --oneline -\d{1,3}$/,
  ];
  return readOnly.some((pattern) => pattern.test(line))
    ? allow('read-only git')
    : deny('only git rev-parse HEAD, git status --short and git log --oneline -N are allowed');
}

/** Decides a Bash command. The default is to refuse. */
export function decideCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') return deny('empty command');
  if (SHELL_SYNTAX.test(command)) {
    return deny('no chaining, redirects, substitutions, quotes, globs or escapes');
  }
  const words = command.trim().split(/\s+/);
  const verdict = checkNpm(words) ?? checkCurl(words) ?? checkGit(words);
  return verdict ?? deny(`"${words[0] ?? ''}" is not a command the tester may run`);
}

/** Turns a path from a tool call into a lower-case `c:/dir/file` form, or null if it is unusable. */
function normalisePath(path, root) {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) return null;
  let text = path.replace(/\\/g, '/');
  text = text.replace(/^\/([a-zA-Z])\//, '$1:/');
  const absolute = /^[a-zA-Z]:\//.test(text) || text.startsWith('/');
  return posix.normalize(absolute ? text : `${root}/${text}`).toLowerCase();
}

/** Decides a file write or edit: only test files, only under the test folders. */
export function decideWrite(filePath, repoRoot) {
  const root = normalisePath(repoRoot, '');
  const target = normalisePath(filePath, root ?? '');
  if (root === null || target === null) return deny('unusable file path');
  const prefix = `${root.replace(/\/$/, '')}/`;
  if (!target.startsWith(prefix)) return deny('files outside the repository cannot be written');
  const relative = target.slice(prefix.length);
  if (!WRITABLE_DIRS.some((dir) => relative.startsWith(dir))) {
    return deny(`only ${WRITABLE_DIRS.join(' and ')} can be written`);
  }
  if (!WRITABLE_EXTENSIONS.some((extension) => relative.endsWith(extension))) {
    return deny(`only ${WRITABLE_EXTENSIONS.join(', ')} files can be written`);
  }
  return allow(`write inside ${relative.split('/')[0]}/`);
}

/** Applies the policy to one hook call (the JSON the harness sends on stdin). */
export function decide(input, repoRoot) {
  const toolName = input?.tool_name;
  const toolInput = input?.tool_input;
  if (toolName === 'Bash') return decideCommand(toolInput?.command);
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    return decideWrite(toolInput?.file_path, repoRoot);
  }
  return deny(`the ${String(toolName)} tool is not one the tester may use through this guard`);
}
