# Parity fixtures from the real app

These files pin the mock's shuffle and typed-answer logic to the real quiz app's behaviour.

- **Source:** the real app's `index.html` (not in this repo), last changed in its repository at commit `5146c4a6` (2026-10-31).
- **Functions run:** `shuffle`, `shuffleQuestion` (the part that maps `correct`), `answerTooLong`, `answerForms`, `normTyped`, `sameTyped`, `editDistance`, `checkTyped`. In that file: the shuffle helpers sit between the `// Shuffle helper` and `// Typed answers` comments, and the typed-answer functions run from `const TYPED_CHARS` to just before `foldChar`.
- **How they were made:** a throwaway script loaded those functions from the real file and ran them on made-up inputs, with `Math.random` replaced by a fixed list of numbers. The expected values below are what the real code returned. The script is not kept in the repo.
- **Content:** every string is invented. No real quiz text, answer or note is used (the repo is public).

| File           | Holds                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shuffle.json` | Options, `correct`, the fixed random numbers, and the real shuffled options and `shuffledCorrect`. Includes a duplicate option text, where the first match wins.                      |
| `typed.json`   | `answerForms` and `answerTooLong` for a range of correct answers, `checkTyped` verdicts (`ok`, `near`) for typed attempts, and cases for `normTyped`, `sameTyped` and `editDistance`. |

Differences from the real code are recorded in [docs/fidelity.md](../../../../../docs/fidelity.md). The one that matters here: the real shuffle draws from `Math.random`; the mock draws from the injected `Random`, which is how a fixed sequence reproduces a known order.

To refresh the fixtures after the real app changes, re-run the same extraction against the new `index.html`, update the commit above and review the diff.
