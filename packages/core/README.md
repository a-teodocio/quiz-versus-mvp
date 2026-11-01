# @quiz-versus/core

The game logic of versus mode, with no I/O: the room state machine, scoring, the seeded shuffle, typed-answer checking and game preparation. It decides what happens; adapters (`worker`, later `web`) carry it out.

## Public API

Everything is exported from `src/index.ts`. Nothing else in the package may be imported from outside it.

| Area     | Exports                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Ports    | `Clock`, `Random`, `Logger`, `QuizRepository` (interfaces the adapters implement)                                            |
| Quiz     | `Quiz`, `QuizEntry` and friends: the real app's JSON schema; `Item`: one scored, shuffled question                           |
| Shuffle  | `shuffle`, `shuffleOptions`: the real app's Fisher-Yates, drawing from `Random`                                              |
| Typed    | `answerForms`, `answerTooLong`, `checkTyped`, `normaliseTyped`, `sameTyped`, `editDistance`: ports of the real app's checker |
| Scoring  | `ScoringRule`, `standardScoring`, `pointsFor`, `rankPlayers`                                                                 |
| Game     | `prepareGame(repository, settings, random)` returns a `GamePlan`; `GameSetupError`                                           |
| Room     | `createRoom`, `step` (the pure state machine), `RoomSession` (adds the clock and logging), the state types                   |
| Wire-ish | `RoomEvent` in, `Effect` out (`send`, `setTimer`, `clearTimer`, `closeRoom`)                                                 |

## How a room is driven

```
adapter: validate message with protocol -> RoomEvent -> session.handle(event) -> Effect[] -> carry them out
```

1. Before `start`, the adapter calls `prepareGame` (async, because loading is) and passes the resulting plan in the `start` event. The state machine therefore needs no randomness and no loading.
2. Every event is stamped with the time from the `Clock` (`RoomSession` does this). Timers are effects: the adapter sets one alarm, and sends `timerFired` when it goes off. A stale alarm is harmless.
3. The adapter supplies fresh player ids and resume tokens in `join` events, from a cryptographic source. Core only stores them.
4. Effects say who gets each message: `caller` (the connection that caused the event), one `player`, or `everyone` (all connected players).

The design is in [ADR 7](../../docs/adr/0007-core-state-machine.md); the game rules in [ADR 6](../../docs/adr/0006-versus-game-rules.md).

## Dependencies

- May import: types and constants from `@quiz-versus/protocol`, nothing else.
- Must not import: `worker`, `web`, `node:*`, Cloudflare APIs. ESLint blocks these, and also `Date`, `Math.random`, timers, `fetch` and `process` inside `core`.

## Tests

```
npm test -- packages/core
```

- `src/**/*.test.ts`: unit tests next to the code. The shuffle and typed-answer tests replay `test/fixtures/real-app/` (see its `SOURCE.md`).
- `test/*.test.ts`: whole-room behaviour through `test/support/room-driver.ts`, which also checks every message the room produces against the protocol's own encoder.
- `test/secrecy.test.ts`: nothing about correctness leaves the room while a question is open.
- `test/tiebreak.test.ts`: the tie-break rules of ADR 6.
