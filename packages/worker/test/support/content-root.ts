import { fileURLToPath } from 'node:url';

/** The repository's fake `content/` folder (never real course material). */
export const fakeContentRoot: string = fileURLToPath(
  new URL('../../../../content', import.meta.url),
);
