// Turns the flags the qa-tester may pass to `npm run qa:ws` (the ones scripts/qa-guard-policy.mjs
// allows) into the flags Vitest understands. Pure, so it can be tested.

const READERS = { list: 'verbose', line: 'default', dot: 'dot' };

/** Flags the guard allows for every test script but that Vitest has no equivalent for. */
const UNSUPPORTED = ['--project', '--repeat-each'];

/**
 * @param {string[]} flags the words after `--`, such as `['--grep', 'J1', '--retries', '1']`
 * @returns {{ args: string[] } | { error: string }}
 */
export function vitestArguments(flags) {
  const args = [];
  for (let at = 0; at < flags.length; at += 2) {
    const [name, inline] = (flags[at] ?? '').split(/=(.*)/s);
    const value = inline ?? flags[at + 1];
    if (inline !== undefined) at -= 1;
    if (value === undefined) return { error: `${name} needs a value` };
    if (UNSUPPORTED.includes(name)) return { error: `${name} is not supported by qa:ws` };
    if (name === '--grep') args.push('-t', value);
    else if (name === '--workers') args.push('--maxWorkers', value);
    else if (name === '--retries') args.push('--retry', value);
    else if (name === '--reporter') {
      if (!Object.hasOwn(READERS, value))
        return { error: `${value} is not a reporter qa:ws knows` };
      args.push(`--reporter=${READERS[value]}`);
    } else return { error: `${name} is not a flag qa:ws knows` };
  }
  return { args };
}
