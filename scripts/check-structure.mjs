// Checks the repo layout against docs/folder-structure.md. Exits 1 on any violation.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { argv, cwd, exit, stdout } from 'node:process';

const root = argv[2] ?? cwd();

/** Top-level entries that may exist. Anything else needs docs/folder-structure.md updated. */
const ALLOWED_TOP_LEVEL = new Set([
  '.claude',
  '.editorconfig',
  '.git',
  '.gitattributes',
  '.github',
  '.gitignore',
  '.husky',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  'CLAUDE.md',
  'LESSONS.md',
  'LICENSE',
  'README.md',
  'commitlint.config.js',
  'content',
  'docs',
  'e2e',
  'eslint.config.js',
  'node_modules',
  'package-lock.json',
  'package.json',
  'packages',
  'scripts',
  'tsconfig.base.json',
  'tsconfig.json',
  'vitest.config.ts',
]);

/** Local artefacts that are git-ignored and so never reach CI. */
const IGNORED_ARTEFACTS = new Set(['dist', 'coverage', 'tsconfig.tsbuildinfo', '.wrangler']);

const BANNED_PACKAGE_DIRS = new Set(['utils', 'helpers', 'common', 'misc', 'shared']);
const REQUIRED_PACKAGE_ENTRIES = ['package.json', 'tsconfig.json', 'README.md', 'src/index.ts'];

const problems = [];

for (const entry of readdirSync(root)) {
  if (!ALLOWED_TOP_LEVEL.has(entry) && !IGNORED_ARTEFACTS.has(entry)) {
    problems.push(
      `Unexpected top-level entry "${entry}". Add it to docs/folder-structure.md and this script, or remove it.`,
    );
  }
}

const packagesDir = join(root, 'packages');
if (existsSync(packagesDir)) {
  for (const name of readdirSync(packagesDir)) {
    const dir = join(packagesDir, name);
    if (!statSync(dir).isDirectory()) {
      problems.push(`packages/${name} is a file; packages/ holds only package folders.`);
      continue;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      problems.push(`packages/${name}: folder names are kebab-case.`);
    }
    for (const required of REQUIRED_PACKAGE_ENTRIES) {
      if (!existsSync(join(dir, required))) {
        problems.push(`packages/${name} is missing ${required}.`);
      }
    }
    const srcDir = join(dir, 'src');
    if (existsSync(srcDir)) {
      for (const sub of readdirSync(srcDir)) {
        if (BANNED_PACKAGE_DIRS.has(sub)) {
          problems.push(
            `packages/${name}/src/${sub}: group code by feature, not into a "${sub}" folder.`,
          );
        }
      }
    }
  }
}

if (problems.length > 0) {
  stdout.write(`Folder structure check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  exit(1);
}
stdout.write('Folder structure OK.\n');
