// The rules the qa-tester subagent is held to. Pure functions, so they can be tested.
//
// Everything is an allowlist: a command, an argument, a tool or a path is refused unless it is
// named here. The hook script (scripts/qa-guard.mjs) applies this policy to every Bash, Write,
// Edit, Read, Grep and Glob call the tester makes. See docs/adr/0008-qa-tester-sandbox.md for what
// this does and does not protect against.
import { posix } from 'node:path';

/** Folders the tester may write to, relative to the repo root. The tester's own tests only. */
export const WRITABLE_DIRS = ['e2e/qa/', 'packages/worker/test/qa/'];
const WRITABLE_EXTENSIONS = ['.ts', '.json'];
/** Base names that are never writable, even inside a writable folder (they configure tools). */
const FORBIDDEN_BASENAMES = /^(package(-lock)?\.json|tsconfig[^/]*\.json|claude\.md|agents\.md)$/;
/** Folder names that are never writable. */
const FORBIDDEN_SEGMENTS = /^(node_modules|\.git|\.claude)$/;
/** Windows device names, which are special wherever they appear in a path. */
const DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/;

/** Anything outside printable ASCII (tabs, newlines, no-break spaces, control characters). */
const NOT_PRINTABLE = /[^\x20-\x7e]/;
/** Characters that let a command do more than one thing, or something other than it reads as. */
const SHELL_SYNTAX = /[;&|`$<>(){}[\]\\"'*!#]/;

// A value never starts with a hyphen, so it cannot be read as another flag.
const SCENARIO_FILTER = /^[A-Za-z0-9_.,][A-Za-z0-9_.,-]{0,59}$/;
const SMALL_NUMBER = /^\d{1,2}$/;

/** Flags the test-running scripts accept, each with the only values it may take. */
const TEST_FLAGS = {
  '--grep': SCENARIO_FILTER,
  '--project': /^[A-Za-z0-9_][A-Za-z0-9_-]{0,29}$/,
  '--workers': SMALL_NUMBER,
  '--repeat-each': SMALL_NUMBER,
  '--retries': /^\d$/,
  '--reporter': /^(list|line|dot)$/,
};

/** The npm scripts the tester may run, each with the flags it may pass after `--`. */
const NPM_SCRIPTS = {
  check: {},
  test: {},
  lint: {},
  typecheck: {},
  'qa:start': {},
  'qa:stop': {},
  'qa:ws': TEST_FLAGS,
  'qa:browser': TEST_FLAGS,
};

const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}(\/[A-Za-z0-9._~/?=%-]*)?$/;

const allow = (reason) => ({ allow: true, reason });
const deny = (reason) => ({ allow: false, reason: `qa-guard: ${reason}` });

/** Checks the words after `--` against the flags a script accepts. Returns a refusal or null. */
function refuseArguments(words, flags) {
  let at = 0;
  while (at < words.length) {
    const [name, inline] = (words[at] ?? '').split(/=(.*)/s);
    const pattern = Object.hasOwn(flags, name) ? flags[name] : undefined;
    if (pattern === undefined) return deny(`the flag "${name}" is not one the tester may pass`);
    const value = inline ?? words[at + 1];
    if (value === undefined || !pattern.test(value)) {
      return deny(`the value for ${name} is missing or not allowed`);
    }
    at += inline === undefined ? 2 : 1;
  }
  return null;
}

/** `npm run <script>`, from the list, with only the flags that script accepts. */
function checkNpm(words) {
  if (words[0] !== 'npm' || words[1] !== 'run') return null;
  const script = words[2] ?? '';
  const flags = Object.hasOwn(NPM_SCRIPTS, script) ? NPM_SCRIPTS[script] : undefined;
  if (flags === undefined) return deny(`npm script "${script}" is not one the tester may run`);
  const rest = words.slice(3);
  if (rest.length === 0) return allow(`npm run ${script}`);
  if (rest[0] !== '--') return deny('npm arguments must come after --');
  if (Object.keys(flags).length === 0) return deny(`npm run ${script} takes no arguments`);
  return refuseArguments(rest.slice(1), flags) ?? allow(`npm run ${script} with arguments`);
}

/** `curl` to this machine only, read-only, no files. */
function checkCurl(words) {
  if (words[0] !== 'curl') return null;
  const url = words.at(-1) ?? '';
  const options = words.slice(1, -1);
  const optionOk = (option, at) =>
    /^-[sSiI]+$/.test(option) ||
    option === '--max-time' ||
    (/^\d{1,3}$/.test(option) && options[at - 1] === '--max-time');
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
  if (NOT_PRINTABLE.test(command)) return deny('only plain printable characters are allowed');
  if (SHELL_SYNTAX.test(command)) {
    return deny('no chaining, redirects, substitutions, quotes, globs or escapes');
  }
  const words = command.trim().split(/ +/);
  const verdict = checkNpm(words) ?? checkCurl(words) ?? checkGit(words);
  return verdict ?? deny(`"${words[0] ?? ''}" is not a command the tester may run`);
}

/** True if the text holds a control character (code below 32), such as a null byte. */
const hasControlCharacter = (text) => [...text].some((char) => char.charCodeAt(0) < 32);

/**
 * Splits a Windows-style absolute path into a lower-case drive and folder names, or returns null
 * for anything else: relative paths, UNC and device paths, drive-relative paths, paths that climb
 * above the drive, control characters.
 */
function splitPath(path) {
  if (typeof path !== 'string' || path === '' || hasControlCharacter(path)) return null;
  let text = path.replace(/\\/g, '/').replace(/^\/([a-zA-Z])\//, '$1:/');
  if (!/^[a-zA-Z]:\//.test(text)) return null;
  const drive = text.slice(0, 2).toLowerCase();
  text = posix.normalize(text.slice(3));
  const names = text.split('/').filter((name) => name !== '' && name !== '.');
  if (names[0] === '..') return null;
  return { drive, names: names.map((name) => name.toLowerCase()) };
}

/** Where a path lies under the repo: the names below the root, or a refusal. */
function belowRoot(path, repoRoot) {
  const root = splitPath(repoRoot);
  const target = splitPath(path);
  if (root === null) return { refusal: deny('the repository location is unusable') };
  if (target === null) return { refusal: deny('use an absolute path on a drive') };
  const inside =
    target.drive === root.drive &&
    target.names.length > root.names.length &&
    root.names.every((name, at) => name === target.names[at]);
  if (!inside) return { refusal: deny('only files inside the repository can be used') };
  return { names: target.names.slice(root.names.length) };
}

/** Names that Windows or the shell treat specially, which could hide where a file really goes. */
const hasOddName = (names) =>
  names.some(
    (name) =>
      /[:~]/.test(name) || name.endsWith('.') || name.endsWith(' ') || DEVICE_NAMES.test(name),
  );

/** Decides a file write or edit: only test files, only under the tester's folders. */
export function decideWrite(filePath, repoRoot) {
  const found = belowRoot(filePath, repoRoot);
  if (found.refusal) return found.refusal;
  const { names } = found;
  if (hasOddName(names)) return deny('that file name could hide where it really goes');
  const relative = names.join('/');
  if (!WRITABLE_DIRS.some((dir) => relative.startsWith(dir))) {
    return deny(`only ${WRITABLE_DIRS.join(' and ')} can be written`);
  }
  if (names.some((name) => FORBIDDEN_SEGMENTS.test(name))) {
    return deny('that folder cannot be written');
  }
  const file = names.at(-1) ?? '';
  if (FORBIDDEN_BASENAMES.test(file))
    return deny('that file configures tools and cannot be written');
  if (!WRITABLE_EXTENSIONS.some((extension) => file.endsWith(extension))) {
    return deny(`only ${WRITABLE_EXTENSIONS.join(' and ')} files can be written`);
  }
  return allow(`write inside ${names.slice(0, 2).join('/')}/`);
}

/** A glob that could reach outside the repo: absolute, drive-relative or climbing. */
const reachesOutside = (pattern) =>
  typeof pattern === 'string' &&
  (/^([a-zA-Z]:|[/\\])/.test(pattern) || /(^|[/\\])\.\.([/\\]|$)/.test(pattern));

/** Decides a read or search: only inside the repo, so real files elsewhere cannot be pulled in. */
export function decideRead(toolName, toolInput, cwd, repoRoot) {
  if (toolName === 'Read') {
    const found = belowRoot(toolInput?.file_path, repoRoot);
    return found.refusal ?? allow('read inside the repository');
  }
  // Grep and Glob search from `path`, or from the working directory when none is given.
  const searchFrom = toolInput?.path ?? cwd;
  const found = belowRoot(searchFrom, repoRoot);
  const root = splitPath(repoRoot);
  const atRoot = root !== null && splitPath(searchFrom)?.names.join('/') === root.names.join('/');
  if (found.refusal && !atRoot) return found.refusal;
  if (reachesOutside(toolInput?.pattern) && toolName === 'Glob') {
    return deny('a glob pattern must stay inside the search folder');
  }
  if (reachesOutside(toolInput?.glob))
    return deny('a glob filter must stay inside the search folder');
  return allow('search inside the repository');
}

/** Applies the policy to one hook call (the JSON the harness sends on stdin). */
export function decide(input, repoRoot) {
  const toolName = input?.tool_name;
  const toolInput = input?.tool_input;
  if (toolName === 'Bash') return decideCommand(toolInput?.command);
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    return decideWrite(toolInput?.file_path, repoRoot);
  }
  if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') {
    return decideRead(toolName, toolInput, input?.cwd, repoRoot);
  }
  return deny(`the ${String(toolName)} tool is not one the tester may use through this guard`);
}
