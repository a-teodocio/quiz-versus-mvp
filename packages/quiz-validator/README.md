# @quiz-versus/quiz-validator

Checks the fake quiz content (`content/`) against the rules of the real app's validator, `tools/validate_quiz.py`: the schema `quiz.py` expects, the question guide's wording rules, pictures, the course registry, and ids that must be unique across files. It is an authoring tool. Nothing in the game imports it.

It is a port, not a wrapper: the same rules, the same messages, and parity tests against the real tool's own output.

## Public API

Everything is exported from `src/index.ts`.

| Export                                         | What it is                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `validateTree(tree, { strict })`               | Checks a whole content folder. Returns the `findings` (sorted as the real tool prints them) and the per-file counts     |
| `readContentTree(root)`                        | Reads `quizzes/` and `images/` under `root` from disk into a `ContentTree` (the only code that touches the file system) |
| `ContentTree`, `ImageSource`                   | What the checks need, as data and one small interface, so tests build a folder in memory                                |
| `formatFinding`, `Finding`, `MOCK_ONLY_PREFIX` | A finding, and the line the real tool would print for it                                                                |
| `readRegistry`, `loadRegistry`, `CourseEntry`  | The course registry (`quizzes/courses.json`), with the real server's defaults                                           |
| `entryKeys`                                    | The progress keys of an entry, as the real server and page work them out                                                |

## Findings

| Level   | Meaning                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------- |
| `ERROR` | The app would misbehave: bad schema, a missing or unsafe picture, a duplicate id. Fails the run |
| `WARN`  | Breaks a guideline of the question guide. The fake content has none                             |
| `NOTE`  | Only with `strict`: heuristics that give false positives, and narrow pictures                   |

The content test runs `strict` and expects no findings at all.

## Rules the mock adds

The real tool has no such rules. Their messages carry `mock: ` so a comparison with the real output can set them apart.

- A question must be one `prepareGame` accepts (`askableProblem` in `core`): lengths within the protocol's limits.
- A file name must make a quiz id (`isQuizId` in `protocol`): lowercase words joined by hyphens.
- A picture must be under `images/`. The real app has two named roots and a read-only fallback; the mock has one.

Where the port differs from the real tool, [docs/fidelity.md](../../docs/fidelity.md) says so.

## Dependencies

May import `@quiz-versus/core` and `@quiz-versus/protocol` only. ESLint also keeps `node:*` out of everything except `src/disk/`, so the checks stay pure. See [ADR 10](../../docs/adr/0010-quiz-validator-package.md).

## Running it

```
npm run validate:content      # the content test: validates content/ strictly and checks the roadmap's cases are still there
npm run fixtures:validator    # regenerate the parity fixtures from the real tool (needs the real app and Pillow; see scripts/make-validator-fixtures.mjs)
```

`test/fixtures/real-app/SOURCE.md` records where the parity fixtures came from.
