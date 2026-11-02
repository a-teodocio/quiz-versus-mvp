// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { builtinModules } from 'node:module';

/**
 * Layer rules (see docs/architecture.md). Dependencies point inward only:
 *   web, worker -> protocol, core;  protocol -> (nothing in the repo);  core -> protocol only (types and constants).
 *   quiz-validator -> protocol, core (an authoring tool that nothing else imports).
 * `core` is pure logic: no I/O, no platform APIs, no other workspace package except `protocol`.
 */
const forbid = (patterns, message) => ({
  'no-restricted-imports': [
    'error',
    { patterns: patterns.map((pattern) => ({ group: [pattern], message })) },
  ],
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
      // Size and complexity limits (review-checklist D1, TD1, TD3).
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'hack'], location: 'anywhere' }],
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      ...forbid(
        [
          '@quiz-versus/worker',
          '@quiz-versus/web',
          '@quiz-versus/quiz-validator',
          'node:*',
          'cloudflare:*',
          '@cloudflare/*',
        ],
        'core must stay pure: it may import only from @quiz-versus/protocol.',
      ),
      // Time and randomness come in through the Clock and Random ports (review-checklist A4).
      'no-restricted-globals': [
        'error',
        ...['Date', 'setTimeout', 'setInterval', 'fetch', 'process', 'localStorage'].map(
          (name) => ({
            name,
            message: `core is pure: do not use ${name}; inject it through a port.`,
          }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the injected Random port.' },
        { object: 'Date', property: 'now', message: 'Use the injected Clock port.' },
      ],
    },
  },
  {
    files: ['packages/protocol/**/*.ts'],
    rules: forbid(
      [
        '@quiz-versus/core',
        '@quiz-versus/worker',
        '@quiz-versus/web',
        '@quiz-versus/quiz-validator',
        'node:*',
        'cloudflare:*',
      ],
      'protocol defines message shapes only and depends on no other workspace package.',
    ),
  },
  {
    files: ['packages/web/**/*.ts'],
    rules: forbid(
      [
        '@quiz-versus/worker',
        '@quiz-versus/quiz-validator',
        'node:*',
        'cloudflare:*',
        '@cloudflare/*',
      ],
      'web talks to the worker only through the protocol, never by importing it.',
    ),
  },
  {
    files: ['packages/worker/**/*.ts'],
    rules: forbid(
      ['@quiz-versus/web', '@quiz-versus/quiz-validator'],
      'worker must not depend on the browser app or the authoring tool.',
    ),
  },
  {
    files: ['packages/quiz-validator/**/*.ts'],
    rules: forbid(
      ['@quiz-versus/worker', '@quiz-versus/web', 'cloudflare:*', '@cloudflare/*'],
      'quiz-validator may use only protocol and core.',
    ),
  },
  {
    // The checks stay pure: the file system is reached only through src/disk (and the tests).
    files: ['packages/quiz-validator/src/**/*.ts'],
    ignores: ['packages/quiz-validator/src/disk/**'],
    rules: {
      // Both the prefixed and the bare spelling of every Node built-in (`node:fs` and `fs`).
      ...forbid(
        [
          '@quiz-versus/worker',
          '@quiz-versus/web',
          'node:*',
          ...builtinModules,
          'cloudflare:*',
          '@cloudflare/*',
        ],
        'only src/disk may touch the file system; the checks take a ContentTree.',
      ),
      'no-restricted-globals': [
        'error',
        ...['process', 'Buffer', 'fetch'].map((name) => ({
          name,
          message: `the checks are pure: do not use ${name}; src/disk is the only adapter.`,
        })),
      ],
    },
  },
  prettier,
);
