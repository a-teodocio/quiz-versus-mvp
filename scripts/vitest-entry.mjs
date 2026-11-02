// Finds the file that starts Vitest. Vitest does not export its start file as a subpath, but it
// exports its package.json, whose `bin` names the file.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** The absolute path of the file `node` runs to start Vitest. */
export function vitestEntry() {
  const manifestPath = createRequire(import.meta.url).resolve('vitest/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.vitest;
  if (typeof bin !== 'string') throw new Error('vitest names no start file in its package.json');
  return join(dirname(manifestPath), bin);
}
