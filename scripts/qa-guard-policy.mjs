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
/** Every name the tester writes uses only these characters, which rules out whole classes of path tricks. */
const SAFE_NAME = /^[a-z0-9._-]+$/;
/** Dot-files, `*.config.*` and set-up files configure the tools that run the tests. */
const TOOL_CONFIG_NAME = /(^\.|\.config\.|^global-?setup|^global-?teardown)/;
/** Places inside the repo that hold secrets or the guard's own log, which are never read. */
const SECRET_FOLDER = /^(\.git|\.wrangler)$/;
const SECRET_FILE = /^(\.dev\.vars|\.env)|\.(pem|key)$/;

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

/** Said after a refusal for an unknown command, so the tester is told what it can do. */
const ALLOWED_SUMMARY =
  'allowed: npm run <listed script>, curl to localhost, three read-only git commands';

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
  if (words[0] !== 'npm') return null;
  if (words[1] !== 'run')
    return deny('of npm, only "npm run <script>" is allowed, for a script on the list');
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
  return (
    verdict ?? deny(`"${words[0] ?? ''}" is not a command the tester may run (${ALLOWED_SUMMARY})`)
  );
}

/** True if the text holds a control character (code below 32), such as a null byte. */
const hasControlCharacter = (text) => [...text].some((char) => char.charCodeAt(0) < 32);

/**
 * Splits an absolute path into a lower-case drive and folder names (`names` as written, `folded`
 * in lower case), or returns null for anything else: relative paths, UNC and device paths
 * (`//...`), drive-relative paths, control characters. Two forms are understood: a Windows drive
 * path (`C:\x`) and a POSIX path (`/home/x`, drive empty), so the guard and its tests run on both.
 * With `gitBash`, the Git Bash spelling of a drive path (`/c/x`) is read as drive `c:`; that is
 * only done when the repo itself is on a drive, so a POSIX folder `/c/x` is never mistaken for one.
 */
function splitPath(path, gitBash = false) {
  if (typeof path !== 'string' || path === '' || hasControlCharacter(path)) return null;
  const slashed = path.replace(/\\/g, '/');
  const text = gitBash ? slashed.replace(/^\/([a-zA-Z])\//, '$1:/') : slashed;
  const windows = /^[a-zA-Z]:\//.test(text);
  if (!windows && (!text.startsWith('/') || text.startsWith('//'))) return null;
  const drive = windows ? text.slice(0, 2).toLowerCase() : '';
  const names = posix
    .normalize(windows ? text.slice(3) : text.slice(1))
    .split('/')
    .filter((name) => name !== '' && name !== '.');
  if (names[0] === '..') return null;
  return { drive, names, folded: names.map((name) => name.toLowerCase()) };
}

/**
 * Where a path lies under the repo: the names below the root (lower case), or a refusal. With
 * `allowRoot`, the repo root itself counts as inside (a folder to work or search in); without it,
 * only things below. On a drive path names compare without regard to case; under a POSIX root,
 * where the file system is case-sensitive, the part that names the repo is compared exactly.
 */
function belowRoot(path, repoRoot, allowRoot = false) {
  const root = splitPath(repoRoot);
  if (root === null) return { refusal: deny('the repository location is unusable') };
  const target = splitPath(path, root.drive !== '');
  if (target === null) return { refusal: deny('use an absolute path') };
  const exact = root.drive === '';
  const deepEnough = allowRoot
    ? target.names.length >= root.names.length
    : target.names.length > root.names.length;
  const inside =
    target.drive === root.drive &&
    deepEnough &&
    (exact ? root.names : root.folded).every(
      (name, at) => name === (exact ? target.names : target.folded)[at],
    );
  if (!inside) return { refusal: deny('only files inside the repository can be used') };
  return { names: target.folded.slice(root.names.length) };
}

/** Names that Windows or the shell treat specially, or that fall outside the plain character set. */
const hasOddName = (names) =>
  names.some((name) => !SAFE_NAME.test(name) || name.endsWith('.') || DEVICE_NAMES.test(name));

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
  if (FORBIDDEN_BASENAMES.test(file) || TOOL_CONFIG_NAME.test(file)) {
    return deny('that file configures tools and cannot be written');
  }
  if (!WRITABLE_EXTENSIONS.some((extension) => file.endsWith(extension))) {
    return deny(`only ${WRITABLE_EXTENSIONS.join(' and ')} files can be written`);
  }
  return allow(`write inside ${names.slice(0, 2).join('/')}/`);
}

/** A glob that could reach outside the repo: absolute, drive-relative, or with `..` or `~` anywhere. */
const reachesOutside = (pattern) =>
  typeof pattern === 'string' && (/^([a-zA-Z]:|[/\\])/.test(pattern) || /\.\.|~/.test(pattern));

/** Braces, brackets and question marks make a glob too hard to check for secret names. */
const usesGlobSyntax = (pattern) => typeof pattern === 'string' && /[{}[\]?]/.test(pattern);

/** A glob that names a secret place. */
const namesSecret = (pattern) =>
  typeof pattern === 'string' &&
  /(^|[/\\*])(\.git|\.wrangler)(?=[/\\*]|$)|(^|[/\\*])\.(env|dev\.vars)|\.(pem|key)(?=[/\\*]|$)/i.test(
    pattern,
  );

/** True for a place inside the repo that holds secrets or the guard's log (names below the root). */
const isSecretPlace = (names) =>
  names.some((name) => SECRET_FOLDER.test(name) || SECRET_FILE.test(name)) ||
  names.join('/').startsWith('node_modules/.cache');

/** Decides a read or search: inside the repo only, and never secrets or the guard's own log. */
export function decideRead(toolName, toolInput, cwd, repoRoot) {
  const isRead = toolName === 'Read';
  // Grep and Glob search from `path`, or from the working directory when none is given.
  const place = isRead ? toolInput?.file_path : (toolInput?.path ?? cwd);
  const found = belowRoot(place, repoRoot, !isRead);
  if (found.refusal) return found.refusal;
  if (isSecretPlace(found.names)) return deny('that place holds secrets or the guard log');
  if (isRead) return allow('read inside the repository');
  // Glob's `pattern` and Grep's `glob` are file globs; Grep's `pattern` is a regex and is not checked.
  const glob = toolName === 'Glob' ? toolInput?.pattern : toolInput?.glob;
  if (reachesOutside(glob)) return deny('a glob must stay inside the search folder');
  if (usesGlobSyntax(glob)) return deny('a glob may not use braces, brackets or question marks');
  if (namesSecret(glob)) return deny('a glob must not name secrets or the guard log');
  return allow('search inside the repository');
}

/** Commands run where the session was started, so that must be the repo, not another project. */
function decideWorkingFolder(cwd, repoRoot) {
  const found = belowRoot(cwd, repoRoot, true);
  return found.refusal ? deny('commands may only run from inside the repository') : null;
}

/** Applies the policy to one hook call (the JSON the harness sends on stdin). */
export function decide(input, repoRoot) {
  const toolName = input?.tool_name;
  const toolInput = input?.tool_input;
  if (toolName === 'Bash') {
    return decideWorkingFolder(input?.cwd, repoRoot) ?? decideCommand(toolInput?.command);
  }
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    return decideWrite(toolInput?.file_path, repoRoot);
  }
  if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') {
    return decideRead(toolName, toolInput, input?.cwd, repoRoot);
  }
  return deny(`the ${String(toolName)} tool is not one the tester may use through this guard`);
}
