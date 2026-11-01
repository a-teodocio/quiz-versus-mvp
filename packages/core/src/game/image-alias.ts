import type { Random } from '../ports/random.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ALIAS_LENGTH = 16;

function randomAlias(random: Random): string {
  return Array.from(
    { length: ALIAS_LENGTH },
    () => ALPHABET[Math.floor(random.next() * ALPHABET.length)] ?? 'a',
  ).join('');
}

/**
 * A random name for an image that does not spell out what it shows, so a file called
 * `liver-section.png` cannot give the answer away. A game keeps the alias to file mapping.
 */
export function issueImageAlias(random: Random, taken: ReadonlySet<string>): string {
  const alias = randomAlias(random);
  return taken.has(alias) ? issueImageAlias(random, taken) : alias;
}
