# Review checklist

The single source of truth for what a review checks. It is used by the `standards-reviewer` subagent (`.claude/agents/standards-reviewer.md`) and by anyone reviewing a pull request. Each rule has an ID so findings can be traced back to it.

The goal is a repo that stays easy to change: low coupling, clear boundaries, small units, tests that catch regressions, and docs that match the code. A rule exists to prevent technical debt, so when a rule is broken on purpose the exception must be written down (see TD).

Severity: **blocker** (fix before merge), **major** (fix before merge unless the owner accepts it), **minor** (fix soon), **nit** (taste, optional).

## A. Architecture and coupling

| ID  | Rule                                                                                                                                                                                                            | Default severity |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| A1  | Dependencies follow the layer rule in `architecture.md`. No package imports an outer layer.                                                                                                                     | blocker          |
| A2  | Packages are used only through their public entry point (`index.ts`). No deep imports into another package's internals.                                                                                         | major            |
| A3  | No circular dependencies between modules or packages.                                                                                                                                                           | major            |
| A4  | `core` is deterministic and pure: no `Date`, `Math.random`, timers, `fetch`, `process`, storage or globals. Time, randomness and loading come in through ports (`Clock`, `Random`, `QuizRepository`, `Logger`). | blocker          |
| A5  | Interfaces are owned by the layer that uses them; adapters implement them. Platform types (Cloudflare, DOM, Node) never appear in `core` signatures.                                                            | major            |
| A6  | Adapters are thin: they translate and delegate. Game rules live in `core`, not in the Worker or the browser app.                                                                                                | major            |
| A7  | No logic duplicated across `worker` and `web`. Shared logic moves to `core` or `protocol`.                                                                                                                      | major            |
| A8  | No module-level mutable state or hidden singletons. Dependencies are passed in.                                                                                                                                 | major            |
| A9  | One reason to change per module. No god files, god classes or catch-all `utils`/`helpers` modules.                                                                                                              | major            |
| A10 | Exports are minimal. Anything not used outside its module is not exported.                                                                                                                                      | minor            |
| A11 | Public types do not leak implementation details (internal state shapes, library types).                                                                                                                         | minor            |
| A12 | Files live where `folder-structure.md` says. Code is grouped by feature, not into `utils`/`helpers`/`common` folders. A new top-level folder updates the doc and `scripts/check-structure.mjs`.                 | minor            |

## B. Protocol and boundaries

| ID  | Rule                                                                                                                                                 | Default severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| B1  | Every message crossing a boundary (WebSocket, HTTP, storage, JSON files) is parsed with a schema at the point of entry. No unvalidated data past it. | blocker          |
| B2  | Message types are derived from the schemas (`z.infer`), never hand-duplicated.                                                                       | major            |
| B3  | The server never sends a correct answer, explanation or other secret before the question is closed (REVEAL).                                         | blocker          |
| B4  | Switches over unions and states are exhaustive (a `never` check), so adding a case breaks the build.                                                 | major            |
| B5  | Changing a message shape is backward-aware: version bump or documented break, and `docs/protocol.md` updated.                                        | major            |
| B6  | Errors crossing a boundary are typed with stable codes, not free-form strings.                                                                       | minor            |

## C. State machine and concurrency

| ID  | Rule                                                                                                                                           | Default severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C1  | State changes happen only through the state machine. Illegal transitions are rejected explicitly and tested.                                   | blocker          |
| C2  | Every event is handled idempotently or rejected: duplicate answers, late answers after timeout, joins after start, repeated disconnects.       | major            |
| C3  | Reconnect, player-leaves and host-leaves paths are defined, not left to chance.                                                                | major            |
| C4  | Timers and scheduled work are cleaned up on every exit path (room end, all players gone).                                                      | major            |
| C5  | State update functions are pure (old state and event in, new state and effects out). Effects are returned as data and executed by the adapter. | major            |

## D. Code quality

| ID  | Rule                                                                                                                                       | Default severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| D1  | Functions are short and do one thing. Roughly: under 40 lines, cyclomatic complexity 10 or less, nesting 3 or less, 4 parameters or fewer. | major            |
| D2  | Names say what a thing is or does. No abbreviations that need decoding, no `data`, `info`, `manager`, `handle` without a noun.             | minor            |
| D3  | No boolean flag parameters that switch behaviour. Split the function or use a named options object.                                        | minor            |
| D4  | No magic numbers or strings. Limits, timeouts and scores are named constants in one place.                                                 | major            |
| D5  | No `any`, no non-null `!`, no unexplained `as` casts, no `@ts-ignore` or `eslint-disable` without a reason on the same line.               | major            |
| D6  | Errors are never swallowed. Empty `catch`, ignored promises and `console.log` debugging are not allowed.                                   | blocker          |
| D7  | Prefer immutable data. Mutation of inputs or shared objects is a defect.                                                                   | major            |
| D8  | No dead code, commented-out code, unused exports or unused dependencies.                                                                   | minor            |
| D9  | Comments explain why, not what. Public functions and exported types have a short doc comment.                                              | minor            |
| D10 | No copy-paste duplication. A third copy is extracted. A premature abstraction (one use, speculative options) is also a defect.             | minor            |
| D11 | Consistent naming and layout: files in kebab-case, one main export per file, tests next to the code or in `test/` as the repo does.        | nit              |
| D12 | The simplest design that meets the need. No speculative generality, no framework where a function would do.                                | minor            |

## E. Testing

| ID  | Rule                                                                                                                                | Default severity |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| E1  | New behaviour has tests at the right level (unit for `core` and `protocol`, integration for the Worker, end to end for user flows). | blocker          |
| E2  | A bug fix includes a test that fails without the fix.                                                                               | blocker          |
| E3  | Tests are deterministic: no real time, real randomness, network, or sleeps. Use the injected clock and random.                      | major            |
| E4  | Tests assert behaviour, not implementation. They do not reach into private state or mock the unit under test.                       | major            |
| E5  | Edge cases are covered: empty, one, many, maximum, duplicates, out-of-order, timeout and disconnect.                                | major            |
| E6  | No `.only`, `.skip` or commented-out tests. Test names describe the behaviour and condition.                                        | major            |
| E7  | Test data is fake and minimal. Fixtures copied from the real app record their source commit.                                        | major            |
| E8  | Coverage on `core` meets the threshold and did not drop. Coverage is a floor, not proof: untested branches are called out.          | major            |

## F. Documentation

| ID  | Rule                                                                                                                                       | Default severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| F1  | README, `architecture.md` and `protocol.md` match the code after this change.                                                              | major            |
| F2  | A significant decision (new dependency, pattern, layer exception, platform choice) has an ADR. Accepted ADRs are superseded, never edited. | major            |
| F3  | Every deliberate simplification of the real app has a row in `fidelity.md`. Closed gaps are removed.                                       | major            |
| F4  | The pull request description says what changed, why, and how it was tested.                                                                | minor            |
| F5  | No em dashes in any text, comment or doc. No stale or contradictory docs.                                                                  | minor            |

## G. Security, privacy and abuse

| ID  | Rule                                                                                                                                                                                                                                                         | Default severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| G1  | No real course content, real questions, images or personal notes; no secrets, tokens, emails or private paths. The repo is public.                                                                                                                           | blocker          |
| G2  | New or upgraded dependencies follow `dependency-vetting.md` (14-day age, audit, signatures, install scripts) and the result is recorded.                                                                                                                     | blocker          |
| G3  | User-supplied text (player names, typed answers) is never inserted as HTML. Use `textContent` or an escaping layer.                                                                                                                                          | blocker          |
| G4  | Inputs have limits: message size, name length, players per room, rooms per client, message rate.                                                                                                                                                             | major            |
| G5  | Room IDs and tokens come from a cryptographic random source with enough entropy. They are never sequential or guessable.                                                                                                                                     | blocker          |
| G6  | The WebSocket upgrade checks the origin where relevant. Players can act only as themselves; the server never trusts a client-supplied identity or score.                                                                                                     | blocker          |
| G7  | Logs contain no secrets or personal data.                                                                                                                                                                                                                    | major            |
| G8  | A guard, filter or permission list (for example the qa-tester guard) is an allowlist of exact commands, flags, values and paths, fails closed, and has a test for each way it should refuse, with the reason checked. A denylist of bad flags is not enough. | major            |

## H. Reliability and operations

| ID  | Rule                                                                                                                   | Default severity |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| H1  | Resources are released: sockets, listeners, timers, subscriptions.                                                     | major            |
| H2  | Rooms end and clean up. Stored state cannot grow without bound.                                                        | major            |
| H3  | Failure paths are handled and observable: structured logs through the injected `Logger`, with enough context to debug. | minor            |
| H4  | Changes to persisted state or protocol cannot break running rooms or old clients without a plan.                       | major            |

## I. Fidelity to the real app

| ID  | Rule                                                                                                                                     | Default severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| I1  | Quiz data follows the real JSON schema, including image-groups with parts, typed answers, and `correct` indexing the unshuffled options. | major            |
| I2  | Shuffling maps the correct index correctly after options are reordered, on the server and the client.                                    | blocker          |
| I3  | Behaviour copied from the real app is not silently changed. If it differs, `fidelity.md` says so.                                        | major            |

## J. Frontend (web package)

| ID  | Rule                                                                                                                                                                                                                                                                              | Default severity |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| J1  | Meets WCAG 2.2 AA (docs/qa-scenarios.md): keyboard operable (the real app uses 1 to 4 and Enter; a single-key shortcut needs an off switch or a focus rule), visible focus that is not hidden, labelled controls, no colour-only meaning, contrast, announcements, 24 px targets. | major            |
| J2  | Works at phone width and at 320 px reflow; respects reduced motion (best practice) and the system colour scheme and forced colors.                                                                                                                                                | minor            |
| J3  | UI state is kept apart from rendering and from the network client. No game rules in view code.                                                                                                                                                                                    | major            |

## K. Git hygiene

| ID  | Rule                                                                                                                                                                                         | Default severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| K1  | Branch name is `feat/`, `fix/`, `chore/` or `docs/`. Commits follow Conventional Commits.                                                                                                    | minor            |
| K2  | One concern per pull request. No unrelated edits, formatting churn or drive-by refactors.                                                                                                    | major            |
| K3  | No generated or build output, local config, or large binaries committed. Lockfile changes match `package.json` changes.                                                                      | major            |
| K4  | Hooks and CI checks are not skipped, weakened or disabled to make a change pass.                                                                                                             | blocker          |
| K5  | The folder layout is clean: no stray, scratch, duplicate or empty files and folders, and each package has the standard shape (`package.json`, `tsconfig.json`, `README.md`, `src/index.ts`). | minor            |

## TD. Technical debt

| ID  | Rule                                                                                                                                             | Default severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| TD1 | No `TODO`, `FIXME` or `HACK` comments. Debt is recorded in `known-issues.md` with its impact and plan.                                           | major            |
| TD2 | A shortcut that breaks a rule above is allowed only with a written exception (comment at the site plus an entry in `known-issues.md` or an ADR). | major            |
| TD3 | Complexity is not growing: a file or function that is already large does not get bigger without being split.                                     | minor            |
| TD4 | Workarounds name the thing they work around and the condition for removing them.                                                                 | minor            |

## Automate when it becomes worthwhile

These are judged by hand today. Once the packages exist, move them into tooling so they cannot regress:

- Import cycles and layer rules beyond ESLint (A1, A3): `dependency-cruiser`.
- Unused exports and dependencies (D8, A10): `knip`.
- Coverage threshold on `core` (E8): Vitest `coverage.thresholds`.
- Presence of tests and docs for changed folders (E1, F1): a small CI script.

Each new tool goes through `dependency-vetting.md` first.
