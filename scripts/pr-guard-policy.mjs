// The rules that keep the author (Claude) from releasing or merging a pull request. Pure functions,
// so they can be tested. See docs/adr/0016-the-owner-releases-pull-requests.md.
//
// A command that never mentions `gh` passes untouched, so the guard stays out of the way of git,
// npm and the tests. A command that mentions `gh` is judged, and refused unless every place `gh`
// appears is the program of a command whose subcommand and flags are on the lists below
// (checklist G8: an allowlist that fails closed). So `gh` inside a quoted string, behind a wrapper
// (`bash -c`, `node -e`, `xargs`), in a variable or in a search pattern is refused, even when it is
// harmless; the refusal says what to do instead. The guard reads the command as text: it stops
// mistakes, not someone set on getting round it.

/** `gh`, or `gh.exe`, as a word. Run on the command with quotes and escapes removed. */
const MENTIONS_GH = /(^|[^a-z0-9_.-])gh(\.exe)?($|[^a-z0-9_-])/i;
/** Characters that quote or escape in bash, PowerShell or cmd, removed before looking for `gh`. */
const QUOTES = /["'`^]/g;
/** Variables, substitution, backticks and here-documents: what runs cannot be read from the text. */
const HIDDEN_COMMAND = /[$`]|<\(|>\(|<</;
/** Characters that end one command and start the next, outside quotes. */
const SEPARATORS = new Set([';', '&', '|', '\n', '\r']);
/**
 * Brackets and braces that open or close a subshell or block (`(gh ...)`, `{ gh ...; }`) when they
 * come before the first word of a command. Inside a word (`repos/{owner}/x`, `if(gh`) they stay part
 * of it, and `gh` next to one is caught as not the program.
 */
const GROUPING = new Set(['(', ')', '{', '}']);
/**
 * An unquoted `(` or `{` that starts an argument runs or expands before the command sees it:
 * PowerShell evaluates `gh pr view 35 (gh pr merge 35)` inner first, and bash expands `{-X,PUT}`
 * into two arguments. In a command that mentions `gh`, such an argument is refused.
 */
const OPENS_AN_EXPRESSION = new Set(['(', '{']);
/** Inside a word, the characters that can sit next to a program name (`!gh`, `G=gh`, `'gh`). */
const NOT_IN_A_NAME = /[^A-Za-z0-9_.\\/:-]+/;

/** What the owner does and the author never does, said in every refusal about releasing. */
const OWNER_RELEASES =
  'only the owner marks a pull request ready, which lets it merge (ADR 16); `gh pr ready --undo` is allowed';
/** Said when `gh` is mentioned in a way that cannot be judged. */
const HOW_TO_AVOID =
  'pass text with --body-file, write commit messages with git commit -F <file>, and search with the Grep tool';

const allow = (reason) => ({ allow: true, judged: true, reason });
const deny = (reason) => ({ allow: false, judged: true, reason: `pr-guard: ${reason}` });
/** For a call the guard does not look at: allowed, and not logged. */
const pass = (reason) => ({ allow: true, judged: false, reason });

/**
 * True if `gh` could run. Looked for once with backslashes kept (a Windows path such as
 * `C:\tools\gh.exe`) and once without (a bash escape such as `g\h`).
 */
function mentionsGh(command) {
  const unquoted = command.replace(QUOTES, '');
  return MENTIONS_GH.test(unquoted) || MENTIONS_GH.test(unquoted.replace(/\\/g, ''));
}

/** The last part of a path, in lower case, without a Windows program extension. */
function programName(word) {
  const base = word.split(/[\\/]/).at(-1) ?? '';
  return base.toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '');
}

/** Escapes a shell removes from a word: the bash backslash and the cmd caret. */
const ESCAPES = /[\\^]/g;

/** True if the word names the `gh` program, written plainly, as a path, or with escapes. */
const isGh = (word) =>
  programName(word) === 'gh' || programName(word.replace(ESCAPES, '')) === 'gh';

/** True if `gh` appears anywhere inside the word, for example in `"gh pr merge"` or `!gh`. */
const containsGh = (word) => word.replace(/\^/g, '').split(NOT_IN_A_NAME).some(isGh);

/**
 * Splits a command into commands, each a list of words, honouring single and double quotes, and
 * notes whether an unquoted `(` or `{` starts an argument (see OPENS_AN_EXPRESSION). Returns null
 * if a quote is never closed.
 */
function scanCommands(command) {
  const commands = [[]];
  let word = null;
  let quote = null;
  let bracketArgument = false;
  const endWord = () => {
    if (word !== null) commands.at(-1)?.push(word);
    word = null;
  };
  for (const char of command) {
    const startsWord = word === null;
    const commandStarted = (commands.at(-1)?.length ?? 0) > 0;
    if (quote !== null) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (SEPARATORS.has(char) || (GROUPING.has(char) && startsWord && !commandStarted)) {
      endWord();
      commands.push([]);
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      if (OPENS_AN_EXPRESSION.has(char) && startsWord) bracketArgument = true;
      word = (word ?? '') + char;
    }
  }
  if (quote !== null) return null;
  endWord();
  return { commands: commands.filter((words) => words.length > 0), bracketArgument };
}

/** The commands of a line, each a list of words; null if a quote is never closed. */
export function splitCommands(command) {
  return scanCommands(command)?.commands ?? null;
}

/**
 * Reads flags and plain words against exact lists. `valueFlags` take the next word (or `=value`);
 * `switches` take none and may not be given a value. Returns `{ words, flags }` (each flag name
 * with every value it was given, in order), or a refusal for any flag not on the lists.
 */
function readArguments(args, { valueFlags = [], switches = [] }) {
  const words = [];
  const flags = new Map();
  const add = (name, value) => flags.set(name, [...(flags.get(name) ?? []), value]);
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? '';
    if (!arg.startsWith('-') || arg === '-') {
      words.push(arg);
      continue;
    }
    const [name = '', inline] = arg.split(/=(.*)/s);
    if (switches.includes(name) && inline === undefined) add(name, true);
    else if (valueFlags.includes(name)) {
      const value = inline ?? args[at + 1];
      if (value === undefined) return { refusal: deny(`${name} needs a value`) };
      add(name, value);
      if (inline === undefined) at += 1;
    } else return { refusal: deny(`the flag "${arg}" is not on the list for this gh command`) };
  }
  return { words, flags };
}

/** The `--repo` flag, which any `gh pr` command may take. */
const REPO_FLAGS = ['-R', '--repo'];

/** The first word after any `--repo` flag, and the words after it. */
function subcommandOf(args) {
  let at = 0;
  while (REPO_FLAGS.includes((args[at] ?? '').split('=')[0] ?? '')) {
    at += (args[at] ?? '').includes('=') ? 1 : 2;
  }
  const word = args[at];
  if (word === undefined) return { name: '', rest: [] };
  if (word.startsWith('-')) return { refusal: deny(`put "${word}" after the subcommand`) };
  return { name: word.toLowerCase(), rest: args.slice(at + 1) };
}

/**
 * `gh pr` subcommands whose flags are not read. Checked against `--help` of gh 2.103.3: none of
 * their flags marks a pull request ready, merges it or prints a secret (the strongest is
 * `gh pr close --delete-branch`).
 */
const PR_SAFE = new Set(['view', 'list', 'diff', 'checks', 'status', 'comment', 'edit', 'close']);

const CREATE_ARGUMENTS = {
  valueFlags: [
    ...REPO_FLAGS,
    ...['-t', '--title', '-b', '--body', '-F', '--body-file', '-B', '--base', '-H', '--head'],
    ...['-l', '--label', '-a', '--assignee', '-r', '--reviewer', '-m', '--milestone'],
  ],
  switches: ['-d', '--draft'],
};

/** `gh pr create`: exact flags, and the draft switch given as a bare switch. */
function checkPrCreate(rest) {
  const read = readArguments(rest, CREATE_ARGUMENTS);
  if (read.refusal) return read.refusal;
  if (read.words.length > 0) return deny('gh pr create takes no plain words; use --title');
  if (!read.flags.has('-d') && !read.flags.has('--draft')) {
    return deny('open the pull request as a draft: add --draft (the owner releases it, ADR 16)');
  }
  return allow('gh pr create --draft');
}

/** `gh pr ready`: only with `--undo` (back to draft), given as a bare switch. */
function checkPrReady(rest) {
  const read = readArguments(rest, { valueFlags: REPO_FLAGS, switches: ['--undo'] });
  if (read.refusal)
    return deny(`${read.refusal.reason.replace('pr-guard: ', '')}; ${OWNER_RELEASES}`);
  if (!read.flags.has('--undo')) return deny(OWNER_RELEASES);
  if (read.words.length > 1) return deny('gh pr ready --undo takes one pull request');
  return allow('gh pr ready --undo');
}

/** The pull request commands. */
function checkPr(args) {
  const sub = subcommandOf(args);
  if (sub.refusal) return sub.refusal;
  const { name, rest } = sub;
  if (PR_SAFE.has(name)) return allow(`gh pr ${name}`);
  if (name === 'create') return checkPrCreate(rest);
  if (name === 'ready') return checkPrReady(rest);
  if (name === 'merge') return deny(`the author never merges; ${OWNER_RELEASES}`);
  if (name === 'reopen') {
    return deny(
      `a reopened pull request that is not a draft turns auto-merge on; ${OWNER_RELEASES}`,
    );
  }
  return deny(`"gh pr ${name}" is not on the list (${[...PR_SAFE, 'create --draft'].join(', ')})`);
}

const METHOD_FLAGS = ['-X', '--method'];
const API_ARGUMENTS = {
  valueFlags: [...METHOD_FLAGS, '-q', '--jq', '-H', '--header', '-t', '--template', '--cache'],
  switches: ['--paginate', '--slurp', '-i', '--include', '--silent', '--verbose'],
};

/** `gh api`: reading only. One method, GET; no fields or input (they make a write); no GraphQL. */
function checkApi(args) {
  const read = readArguments(args, API_ARGUMENTS);
  if (read.refusal) {
    return deny(`gh api may only read: ${read.refusal.reason.replace('pr-guard: ', '')}`);
  }
  const { words, flags } = read;
  const methods = METHOD_FLAGS.flatMap((name) => flags.get(name) ?? []);
  if (methods.length > 1) return deny('gh api takes the method once');
  if (String(methods[0] ?? 'GET').toUpperCase() !== 'GET') return deny('gh api may only use GET');
  if (words.length !== 1) return deny('gh api takes exactly one endpoint');
  if (/^graphql$/i.test(words[0] ?? '')) {
    return deny('gh api graphql is not allowed (use REST GET)');
  }
  return allow('gh api GET');
}

/** `gh auth status`, without the flags that print the token (`--show-token`, and `--json`). */
function checkAuth(name, rest) {
  if (name !== 'status') return deny(`"gh auth ${name}" is not on the list (status)`);
  const read = readArguments(rest, {
    valueFlags: ['-h', '--hostname'],
    switches: ['-a', '--active'],
  });
  return read.refusal ?? allow('gh auth status');
}

/**
 * Other `gh` commands, with the second-level subcommands allowed for each. Their flags are not
 * read; checked against `--help` of gh 2.103.3, none can release or merge a pull request or print
 * a secret. Most only read; `issue create` and `issue comment` write an issue, which is harmless.
 */
const OTHER_COMMANDS = {
  run: ['list', 'view', 'watch'],
  workflow: ['list', 'view'],
  repo: ['view'],
  issue: ['list', 'view', 'create', 'comment'],
  ruleset: ['list', 'view', 'check'],
  label: ['list'],
  release: ['list', 'view'],
};
/** Subcommands of `gh` allowed whatever follows them: help, versions and searches. */
const ANYTHING_AFTER = new Set(['', '--version', '--help', 'help', 'status', 'search']);

/** Judges the words after `gh`. */
function checkGhArguments(args) {
  const top = (args[0] ?? '').toLowerCase();
  if (ANYTHING_AFTER.has(top)) return allow(`gh ${top}`.trim());
  if (top === 'pr') return checkPr(args.slice(1));
  if (top === 'api') return checkApi(args.slice(1));
  const known = top === 'auth' || Object.hasOwn(OTHER_COMMANDS, top);
  if (!known) return deny(`"gh ${top}" is not on the list of gh commands`);
  const sub = subcommandOf(args.slice(1));
  if (sub.refusal) return sub.refusal;
  if (top === 'auth') return checkAuth(sub.name, sub.rest);
  const allowed = OTHER_COMMANDS[top] ?? [];
  return allowed.includes(sub.name)
    ? allow(`gh ${top} ${sub.name}`)
    : deny(`"gh ${top} ${sub.name}" is not on the list (${allowed.join(', ')})`);
}

/** Judges one command (a list of words) from a line that mentions `gh`. */
function checkWords(words) {
  const [program = '', ...args] = words;
  if (isGh(program)) {
    if (args.some((arg) => arg.startsWith('@'))) return deny('no splatting in gh arguments');
    return checkGhArguments(args);
  }
  if (words.some(containsGh)) {
    return deny(`gh appears where it is not the program, so it cannot be judged; ${HOW_TO_AVOID}`);
  }
  return allow('no gh in this part');
}

/** Decides a Bash or PowerShell command. A command that never mentions `gh` passes untouched. */
export function decideCommand(command) {
  if (typeof command !== 'string') return deny('the command could not be read');
  if (!mentionsGh(command)) return pass('no gh');
  if (HIDDEN_COMMAND.test(command)) {
    return deny(
      `a command that mentions gh may not use $, backticks, <(...) or here-documents; ${HOW_TO_AVOID}`,
    );
  }
  const scanned = scanCommands(command);
  if (scanned === null) return deny('a quote is not closed');
  if (scanned.bracketArgument) {
    return deny(
      'in a command that mentions gh, an argument may not start with ( or { (PowerShell runs it first, bash expands it); quote it',
    );
  }
  for (const words of scanned.commands) {
    const verdict = checkWords(words);
    if (!verdict.allow) return verdict;
  }
  return allow('gh command on the list');
}

/** Decides a tool call as the harness sends it. Only Bash and PowerShell commands are judged. */
export function decide(input) {
  const tool = input?.tool_name;
  if (tool !== 'Bash' && tool !== 'PowerShell') return pass(`${String(tool)} is not judged`);
  return decideCommand(input?.tool_input?.command);
}
