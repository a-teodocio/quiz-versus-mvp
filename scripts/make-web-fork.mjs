// Makes packages/web/public/index.html: a copy of the REAL quiz app's page with the few edits
// this public repo needs, nothing else.
//
//   node scripts/make-web-fork.mjs <path to the real app's index.html>
//
// The real file is only read. The script refuses a page whose SHA-256 is not the one recorded
// below (the real app changed: look at the diff, update the hash and the edits, and say so in
// packages/web/SOURCE.md). Every edit must match exactly the number of times listed, so a
// moved line fails loudly instead of being skipped. The edits are the only difference between
// the real page and the fork; SOURCE.md lists them and `npm run test` checks the fork's hash.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit, stdout } from 'node:process';

/** SHA-256 of the real page at the commit named in packages/web/SOURCE.md (line endings as LF). */
export const SOURCE_SHA256 = 'b5a98270bd85726cd177f1d55bc49729a0a401164d2a5979ecd47cb3e4a24a54';

/** Dashes this repo bans in text, built from code points so that this file holds none itself. */
const EM = String.fromCodePoint(0x2014);
const EN = String.fromCodePoint(0x2013);
/** The page also writes them as escapes inside strings: a backslash, a u and four digits. */
const EM_ESCAPE = String.fromCodePoint(0x5c) + 'u2014';
const EN_ESCAPE = String.fromCodePoint(0x5c) + 'u2013';
export const BANNED_DASHES = [
  EM,
  EN,
  EM_ESCAPE,
  EN_ESCAPE,
  '&mdash;',
  '&ndash;',
  '&#8212;',
  '&#8211;',
];

/**
 * The edits, in order. `from` is a literal piece of the real page, `to` its replacement,
 * `count` how many times `from` must occur.
 *
 * Em dashes: this repo bans them in any text, and the real page shows them in ten strings (the
 * answer feedback line, the toasts and the results note), six of them written as an escape.
 * Each becomes a colon. Three comments name a person and one quotes a real chapter title; the
 * repo is public, so those four are found by a pattern that does not spell the original text
 * (this file must not hold what it removes). A `from` is a string or a RegExp; the real file's
 * hash is pinned, so the pattern can only ever match what it matched when it was written.
 */
export const EDITS = [
  { from: `✗ Almost ${EM} check`, to: '✗ Almost: check', count: 1 },
  { from: `distribution ${EM_ESCAPE} adjust`, to: 'distribution: adjust', count: 1 },
  { from: `session ${EM_ESCAPE} are they`, to: 'session: are they', count: 1 },
  { from: `</strong> ${EM_ESCAPE} '`, to: "</strong>: '", count: 4 },
  { from: `Time’s up ${EM} '`, to: "Time’s up: '", count: 1 },
  { from: `Ended early ${EM} '`, to: "Ended early: '", count: 1 },
  { from: `' unanswered ${EM} '`, to: "' unanswered: '", count: 1 },
  {
    from: /what [A-Z][a-z]+ last clicked for it/g,
    to: 'what the user last clicked for it',
    count: 1,
  },
  { from: /\(v1\.42\.0, [A-Z][a-z]+\)/g, to: '(v1.42.0)', count: 1 },
  { from: /\([A-Z][a-z]+, v1\.41\.0\)/g, to: '(v1.41.0)', count: 1 },
  {
    from: /"Chapter 12 - [A-Za-z ]+: Terminology"/g,
    to: '"Chapter 12 - Example Topic: Terminology"',
    count: 1,
  },
];

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Applies the edits to a text; every edit must match exactly as often as listed. */
export function applyEdits(text, edits) {
  let out = text;
  for (const { from, to, count } of edits) {
    const found =
      typeof from === 'string' ? out.split(from).length - 1 : (out.match(from) ?? []).length;
    if (found !== count) {
      throw new Error(
        `An edit matched ${found} times, expected ${count}: ${String(from).length} characters long.`,
      );
    }
    out = typeof from === 'string' ? out.split(from).join(to) : out.replace(from, to);
  }
  if (BANNED_DASHES.some((dash) => out.includes(dash))) {
    throw new Error('The text still holds a dash that the repo rules ban. Add an edit for it.');
  }
  return out;
}

/** The fork's text for the real page's text, or an Error saying which check failed. */
export function makeFork(realHtml) {
  const lf = realHtml.replace(/\r\n/g, '\n');
  if (sha256(lf) !== SOURCE_SHA256) {
    throw new Error(
      `The real page is not the recorded one (SHA-256 ${sha256(lf)}). Review the change before updating SOURCE_SHA256 and EDITS.`,
    );
  }
  return applyEdits(lf, EDITS);
}

if (argv[1] !== undefined && resolve(argv[1]) === import.meta.filename) {
  const htmlPath = argv[2];
  if (htmlPath === undefined) {
    stdout.write('Usage: node scripts/make-web-fork.mjs <path to the real index.html>\n');
    exit(1);
  }
  const fork = makeFork(readFileSync(htmlPath, 'utf8'));
  const target = join(import.meta.dirname, '..', 'packages', 'web', 'public', 'index.html');
  writeFileSync(target, fork);
  stdout.write(`Wrote ${target}\nSHA-256 of the fork: ${sha256(fork)}\n`);
}
