// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Layer rules (see docs/architecture.md). Dependencies point inward only:
 *   web, worker -> protocol, core;  protocol -> (nothing in the repo);  core -> protocol types only.
 * `core` is pure logic: no I/O, no platform APIs, no other workspace package except `protocol`.
 */
const forbid = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: patterns.map((group) => ({ group, message })) }],
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.wrangler/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['packages/**/*.ts'],
  })),
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: forbid(
      ['@quiz-versus/worker', '@quiz-versus/web', 'node:*', 'cloudflare:*', '@cloudflare/*'],
      'core must stay pure: it may import only from @quiz-versus/protocol (types).',
    ),
  },
  {
    files: ['packages/protocol/**/*.ts'],
    rules: forbid(
      ['@quiz-versus/core', '@quiz-versus/worker', '@quiz-versus/web', 'node:*', 'cloudflare:*'],
      'protocol defines message shapes only and depends on no other workspace package.',
    ),
  },
  {
    files: ['packages/web/**/*.ts'],
    rules: forbid(
      ['@quiz-versus/worker', 'node:*', 'cloudflare:*', '@cloudflare/*'],
      'web talks to the worker only through the protocol, never by importing it.',
    ),
  },
  {
    files: ['packages/worker/**/*.ts'],
    rules: forbid(['@quiz-versus/web'], 'worker must not depend on the browser app.'),
  },
  prettier,
);
