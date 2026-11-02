# 10. The quiz validator is a package of its own

Status: accepted (2026-11-02)

## Context

The fake content must pass the same rules as real content, or the mock stops being a fair trial ([fidelity.md](../fidelity.md)). The real app keeps those rules in `tools/validate_quiz.py`. The roadmap asks for a TypeScript port that checks the fake files, so the check can run in `npm run check` and in CI, where Python and the real app are absent.

Where to put it was open. `core` must stay pure and is about the game, not about authoring; the validator needs the file system, and has rules (question wording, picture widths) that no game ever uses.

## Decision

**A new package, `packages/quiz-validator`**, that may import `core` and `protocol` and that nothing else imports. It is the only place that knows the real validator's rules.

**Pure checks, one adapter.** `validateTree` takes a `ContentTree`: the registry text, the course folders, every quiz file's text and an `ImageSource` (the first bytes of a picture). It returns findings as data. Only `src/disk/` touches the file system (`readContentTree`); ESLint keeps every Node built-in (`node:fs` and plain `fs` alike) and the `process` and `Buffer` globals out of the rest. Tests build a tree in memory.

**Parity by the real tool's own output, not by reading its code.** `scripts/make-validator-fixtures.mjs` runs the real validator on small invented folders and records what it prints; `test/parity.test.ts` expects the port to print the same lines in the same order. The traps found in the Python are covered: its `\w`, `\b` and `\s` know every language's letters, JavaScript's do not, so the port spells them out, and the fixtures include accented text that would pass under the wrong class. The fixtures record the real tool's commit.

**The real rules are reused from `core` and `protocol`, not copied.** The option count and length limits come from `protocol`; whether a question can be sent comes from `askableProblem` in `core` (the check `prepareGame` already makes, now exported); whether a file name can be a quiz id comes from `isQuizId` in `protocol`. The mock's own rules are marked `mock: ` in the message so the parity test sets them apart.

**The gate is a test inside `npm run check`.** `test/content.test.ts` validates `content/` strictly and expects nothing at all, and a second group of tests checks that the cases the roadmap asks for (text, image and image-group questions, typed answers a check accepts and ones it cannot, awkward whitespace, two courses, one typed) are still in the content. `test/content-plays.test.ts` runs the content through `prepareGame` and the shuffle. `npm run validate:content` runs the content test alone. There is no command-line program: Node's type stripping cannot resolve the `.js` import specifiers the packages use, and a runner such as `tsx` would be a new dependency for little gain.

**"Options that shuffle to the same position" is a property of a fixed `Random`, not of the content.** The real validator rejects duplicate options, so a file cannot carry that case as duplicates. The content tests use a `Random` that moves nothing (the correct index stays where the file puts it) and one that moves everything (it still points at the correct text), over every question.

## Consequences

- The fake content cannot drift from the real schema and rules unnoticed, and a port of the real validator to TypeScript exists for the real app to reuse.
- One dev dependency is added, `@types/node` 24.19.2, for the disk adapter and tests; it is vetted in [dependency-vetting.md](../dependency-vetting.md) and its types apply to this package only (the other packages keep `types: []`).
- `core` gained one export (`askableProblem`) and `protocol` one (`isQuizId`), both tiny and tested.
- A new package is a major change, so it goes through the `standards-reviewer` (with the second look after fixes) before its pull request; the pull request names the commit the final review covered.
- Differences between the port and the real tool are recorded in [fidelity.md](../fidelity.md) (pictures, reading JSON and running the tool, and the rules the mock adds).
- Parity covers the cases in the fixtures. A rule the fixtures do not exercise could still differ; add a case when one is found.
- Alternatives considered: putting the checks in `core` (would give it a file system or a pile of authoring rules it does not use), a script in `scripts/` (not type-checked or linted like a package, and cannot share the model types), running the Python from CI (the real app is not in this repo and the repo is public).
