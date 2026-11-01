# 7. Shape of the core state machine

Status: accepted (2026-11-01)

## Context

`core` must implement the rules of [ADR 6](0006-versus-game-rules.md) without touching a clock, a random source, a network or storage, and must be testable with no Cloudflare in sight. Several choices follow from that, and the worker will depend on each of them.

## Decision

**A pure `step(state, event)` returns `{ state, effects }`.** State is a union by phase (`lobby`, `question`, `reveal`, `results`), so a field that only exists in one phase cannot be read in another. Rejected requests return the same state and one `error` effect; nothing is ignored silently, except a `disconnect` or `leave` from someone who is not in the room, and a timer that fires when no question is due.

**The game is prepared before it starts.** `prepareGame` (async, because the `QuizRepository` loads) picks and shuffles the questions and a reserve of at most `MAX_TIEBREAK_ROUNDS` more for tie-breaks, and the `start` event carries the result (`GamePlan`). The state machine needs neither randomness nor loading, so it is replayable from its events. "No spare question left" is simply an empty reserve. The repository only loads quizzes; core derives the reserve. This supersedes the sentence in ADR 6's consequences that `QuizRepository` supplies spare questions.

**Time arrives as data.** Every event carries `now`. `RoomSession` stamps it from the `Clock`. A question's deadline is stored, so a late joiner is sent the time left, never less than 1 ms. A timer is an effect (`setTimer` with an absolute time, `clearTimer`), at most one at a time, and its firing is an event. An answer that arrives after the deadline closes the question as a timeout and is then refused with `STALE_QUESTION`, so a late alarm cannot award points.

**Answers are held, scores move at the reveal.** An accepted answer is stored on the open question. Scores, correct counts and `tiebreak` change only when the question closes, so no snapshot or message sent while it is open depends on who was right (tested). Points come from a `ScoringRule`; core rounds and clamps whatever it returns.

**Item keys are issued by core** when the plan is built (`i12`, `i12p2`: the entry's place in this game, then the part), so stale-answer checks stay inside the state machine. The plan keeps the content id for the worker's map. Image files are replaced by random opaque names (`/images/<16 characters>`) that the plan maps back to the file, so a file name cannot give an answer away.

**Effects name their audience.** `caller` (the connection that caused the event, needed because a player has no id before `welcome`), one `player`, or `everyone` (connected players). The adapter turns these into socket writes.

**Choices the rules left open** (interpretations, like those in ADR 6):

- _Host._ The host keeps the role while connected. If the host disconnects or leaves, the earliest-joined connected player becomes host and a returning host does not take it back. With nobody connected, the host stays.
- _Late joiners and ties._ A late joiner is never in a tie-break. If a late joiner shares the top score, the others still play off (when two or more of them are level); the late joiner keeps rank 1 on the equal score.
- _A tied player leaves for good._ They are removed from the tie-break. If fewer than two remain, the tie-break ends: during a question the game goes straight to the results, during a reveal the next step is the results. A tied player who only drops stays in.
- _Counting questions._ `questionCount` counts scored items (each group part on its own). A group stays together, so the last one may be cut short; its remaining parts join the reserve.
- _Answers in a reveal._ An `answer` while a reveal is showing is refused with `STALE_QUESTION` (the question has closed), in the lobby or results with `WRONG_PHASE`.
- _Shuffle._ The shuffle follows the real app exactly (Fisher-Yates, `correct` found again by option text, so duplicate option text maps to the first match). Only the source of the numbers differs.

## Consequences

- Adapters must call `prepareGame` before `start`, supply ids and tokens, send `timerFired`, and carry out the effects.
- **Randomness must be unpredictable in production.** One `Random` stream fixes the secret option order and the public image names, so a weak seeded generator could be recovered from what clients see and used to predict later answers. The worker must back `Random` with `crypto.getRandomValues`. Tests use a fixed or seeded one.
- **Content is not trusted.** `prepareGame` refuses a question the protocol cannot carry (not exactly 4 options, a `correct` index that points at no option, empty or over-long text) with `GameSetupError('invalid-quiz')`, so a bad file fails at setup, not mid-game. The adapter answers `INVALID_SETTINGS`.
- **Connections are the adapter's.** Events name a player, not a socket. The adapter must ignore a `disconnect` from a connection that a resume has replaced, and close the old connection when a resume takes over a seat that still shows as connected. A new `join` whose supplied player id is already seated is refused with `INTERNAL_ERROR`: the adapter must supply fresh ids.
- **Abandoned rooms are the adapter's.** Core emits `closeRoom` only when the last player leaves (and then resets to an empty lobby, so a late alarm or join cannot break it). If everyone merely disconnects, the question times out and the reveal waits for a host who is gone; the worker owns an idle time limit.
- **No minimum to start.** The machine starts a game for any room with a host, even one player. The "2 or more" in the roadmap is the aim, not a rule; the web client may ask for it.
- The same events always give the same room, which is what lets integration tests in the worker script a game.
- Host hand-over and the choices above are behaviour the web client will see; `docs/protocol.md` records the parts visible on the wire.
- A different tie rule or a speed multiplier changes `tiebreak.ts` or the `ScoringRule` only.
