// The rules that keep the author (Claude) from releasing or merging a pull request. Pure functions,
// so they can be tested. See docs/adr/0016-the-owner-releases-pull-requests.md.
//
// Only commands that run `gh` are judged; every other command passes untouched, so the guard never
// gets between the author and git, npm or the tests. A `gh` command is refused unless its
// subcommand and flags are on the lists below (checklist G8: an allowlist that fails closed). The
// guard reads the command as text: it stops mistakes, not someone set on getting round it.

/** `gh`, or `gh.exe`, as a word. Run on the command with quotes and escapes removed. */
const MENTIONS_GH = /(^|[^a-z0-9_.-])gh(\.exe)?($|[^a-z0-9_-])/i;
/** Characters that quote or escape in bash, PowerShell or cmd, removed before looking for `gh`. */
const QUOTES = /["'`^]/g;

/**
 * True if `gh` could run. Looked for once with backslashes kept (a Windows path such as
 * `C:\tools\gh.exe`) and once without (a bash escape such as `g\h`).
 */
function mentionsGh(command) {
  const unquoted = command.replace(QUOTES, '');
  return MENTIONS_GH.test(unquoted) || MENTIONS_GH.test(unquoted.replace(/\\/g, ''));
}
/** Substitution, process substitution, here-documents and PowerShell escapes hide what runs. */
const HIDDEN_COMMAND = /\$\(|`|<\(|>\(|<</;
/** Programs that run another command given as text, so `gh` inside them cannot be judged. */
const RUNS_OTHER_COMMANDS = new Set([
  'bash',
  'sh',
  'zsh',
  'cmd',
  'powershell',
  'pwsh',
  'eval',
  'iex',
  'invoke-expression',
  'invoke-command',
  'icm',
  'start-process',
  'saps',
  'xargs',
  'env',
  'command',
]);
/** Characters that end one command and start the next, outside quotes. */
const SEPARATORS = new Set([';', '&', '|', '\n', '\r']);

/** What the owner does and the author never does, said in every refusal about releasing. */
const OWNER_RELEASES =
  'only the owner marks a pull request ready, which lets it merge (ADR 16); `gh pr ready --undo` is allowed';

const allow = (reason) => ({ allow: true, reason });
const deny = (reason) => ({ allow: false, reason: `pr-guard: ${reason}` });

/** The last part of a path, in lower case, with `.exe` removed. */
function programName(word) {
  const base = word.split(/[\\/]/).at(-1) ?? '';
  return base.toLowerCase().replace(/\.exe$/, '');
}

/** True if the word names the `gh` program, written plainly, as a path, or with escapes. */
const isGh = (word) => programName(word) === 'gh' || programName(word.replace(/\\/g, '')) === 'gh';

/**
 * Splits a command into commands, each a list of words, honouring single and double quotes.
 * Returns null if a quote is never closed.
 */
export function splitCommands(command) {
  const commands = [[]];
  let word = null;
  let quote = null;
  const endWord = () => {
    if (word !== null) commands.at(-1)?.push(word);
    word = null;
  };
  for (const char of command) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (SEPARATORS.has(char)) {
      endWord();
      commands.push([]);
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      word = (word ?? '') + char;
    }
  }
  if (quote !== null) return null;
  endWord();
  return commands.filter((words) => words.length > 0);
}

/**
 * Reads flags and plain words. `valueFlags` take the next word (or `=value`); `switches` take none.
 * Returns `{ words, flags }` (flags by name, value or true), or a refusal for an unknown flag.
 */
function readArguments(args, valueFlags, switches) {
  const words = [];
  const flags = new Map();
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? '';
    if (!arg.startsWith('-') || arg === '-') {
      words.push(arg);
      continue;
    }
    const [name = '', inline] = arg.split(/=(.*)/s);
    if (switches.has(name) && inline === undefined) flags.set(name, true);
    else if (valueFlags.has(name)) {
      const value = inline ?? args[at + 1];
      if (value === undefined) return { refusal: deny(`${name} needs a value`) };
      flags.set(name, value);
      if (inline === undefined) at += 1;
    } else return { refusal: deny(`the flag "${arg}" is not on the list for this gh command`) };
  }
  return { words, flags };
}

/** Flags every `gh` subcommand may take before its own subcommand. */
const REPO_FLAGS = new Set(['-R', '--repo']);

/**
 * The first word after any `--repo` flag, and the words after it. A subcommand whose own flags are
 * not judged (read-only ones) gets them unread.
 */
function subcommandOf(args) {
  let at = 0;
  while (REPO_FLAGS.has((args[at] ?? '').split('=')[0] ?? '')) {
    at += (args[at] ?? '').includes('=') ? 1 : 2;
  }
  const word = args[at];
  if (word === undefined) return { name: '', rest: [] };
  if (word.startsWith('-')) return { refusal: deny(`put "${word}" after the subcommand`) };
  return { name: word.toLowerCase(), rest: args.slice(at + 1) };
}

/** `gh pr` subcommands that only read, comment, edit text or close: they cannot release or merge. */
const PR_SAFE = new Set(['view', 'list', 'diff', 'checks', 'status', 'comment', 'edit', 'close']);
const DRAFT_FLAGS = new Set(['-d', '--draft']);

/** `gh pr create` must open a draft. */
function checkPrCreate(rest) {
  const draft = rest.some((arg) => DRAFT_FLAGS.has(arg) || /^--draft=true$/i.test(arg));
  const notDraft = rest.some((arg) => /^--draft=/i.test(arg) && !/^--draft=true$/i.test(arg));
  return draft && !notDraft
    ? allow('gh pr create --draft')
    : deny('open the pull request as a draft: add --draft (the owner releases it, ADR 16)');
}

/** The pull request commands. */
function checkPr(args) {
  const sub = subcommandOf(args);
  if (sub.refusal) return sub.refusal;
  const { name, rest } = sub;
  if (PR_SAFE.has(name)) return allow(`gh pr ${name}`);
  if (name === 'create') return checkPrCreate(rest);
  if (name === 'ready') {
    return rest.includes('--undo') ? allow('gh pr ready --undo') : deny(OWNER_RELEASES);
  }
  if (name === 'merge') return deny(`the author never merges; ${OWNER_RELEASES}`);
  if (name === 'reopen') {
    return deny(
      `a reopened pull request that is not a draft turns auto-merge on; ${OWNER_RELEASES}`,
    );
  }
  return deny(`"gh pr ${name}" is not on the list (${[...PR_SAFE, 'create --draft'].join(', ')})`);
}

const API_VALUE_FLAGS = new Set(['-q', '--jq', '-H', '--header', '-t', '--template', '--cache']);
const API_METHOD_FLAGS = new Set(['-X', '--method']);
const API_SWITCHES = new Set(['--paginate', '--slurp', '-i', '--include', '--silent', '--verbose']);

/** `gh api`: reading only. No method but GET, no fields or input (they make a write), no GraphQL. */
function checkApi(args) {
  const valueFlags = new Set([...API_VALUE_FLAGS, ...API_METHOD_FLAGS]);
  const read = readArguments(args, valueFlags, API_SWITCHES);
  if (read.refusal) {
    return deny(`gh api may only read: ${read.refusal.reason.replace('pr-guard: ', '')}`);
  }
  const { words, flags } = read;
  const method = flags.get('-X') ?? flags.get('--method') ?? 'GET';
  if (String(method).toUpperCase() !== 'GET') return deny('gh api may only use GET');
  if (words.length !== 1) return deny('gh api takes exactly one endpoint');
  if (/^graphql$/i.test(words[0] ?? ''))
    return deny('gh api graphql is not allowed (use REST GET)');
  return allow('gh api GET');
}

/** Subcommands of `gh` with the second-level subcommands allowed for each. All of these read. */
const READ_ONLY = {
  auth: ['status'],
  run: ['list', 'view', 'watch'],
  workflow: ['list', 'view'],
  repo: ['view'],
  issue: ['list', 'view', 'create', 'comment'],
  ruleset: ['list', 'view', 'check'],
  label: ['list'],
  release: ['list', 'view'],
};
/** Subcommands of `gh` allowed whatever follows them. */
const ANYTHING_AFTER = new Set(['', '--version', '--help', 'help', 'status', 'search']);

/** Judges the words after `gh`. */
function checkGhArguments(args) {
  const top = (args[0] ?? '').toLowerCase();
  if (ANYTHING_AFTER.has(top)) return allow(`gh ${top}`.trim());
  if (top === 'pr') return checkPr(args.slice(1));
  if (top === 'api') return checkApi(args.slice(1));
  const allowed = Object.hasOwn(READ_ONLY, top) ? READ_ONLY[top] : undefined;
  if (allowed === undefined) return deny(`"gh ${top}" is not on the list of gh commands`);
  const sub = subcommandOf(args.slice(1));
  if (sub.refusal) return sub.refusal;
  return allowed.includes(sub.name)
    ? allow(`gh ${top} ${sub.name}`)
    : deny(`"gh ${top} ${sub.name}" is not on the list (${allowed.join(', ')})`);
}

/** Judges one command: a list of words. Only a command that runs `gh` can be refused. */
function checkWords(words) {
  const at = words.findIndex(isGh);
  if (at === -1) return allow('no gh');
  const args = words.slice(at + 1);
  if (args.some((arg) => arg.includes('$') || arg.startsWith('@'))) {
    return deny('write gh arguments out in full: no variables or splatting (use --body-file)');
  }
  return checkGhArguments(args);
}

/** Decides a Bash or PowerShell command. Anything that does not run `gh` is allowed. */
export function decideCommand(command) {
  if (typeof command !== 'string') return deny('the command could not be read');
  if (!mentionsGh(command)) return allow('no gh');
  if (HIDDEN_COMMAND.test(command)) {
    return deny(
      'a command that mentions gh may not use $(...), backticks, <(...) or here-documents (use --body-file)',
    );
  }
  const commands = splitCommands(command);
  if (commands === null) return deny('a quote is not closed');
  for (const words of commands) {
    if (words.some((word) => RUNS_OTHER_COMMANDS.has(programName(word)))) {
      return deny(
        'gh may not be run through another shell or a wrapper (bash -c, env, xargs, iex)',
      );
    }
    const verdict = checkWords(words);
    if (!verdict.allow) return verdict;
  }
  return allow('gh command on the list');
}

/** Decides a tool call as the harness sends it. Only Bash and PowerShell commands are judged. */
export function decide(input) {
  const tool = input?.tool_name;
  if (tool !== 'Bash' && tool !== 'PowerShell') return allow(`${String(tool)} is not judged`);
  return decideCommand(input?.tool_input?.command);
}
