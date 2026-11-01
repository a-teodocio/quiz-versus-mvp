# Protocol

Every message between the browser and the server, over one WebSocket per player. The schemas live in `packages/protocol` and are the source of truth; this page explains them. Message types are derived from the schemas with `z.infer`, so the code and the types cannot drift apart.

Protocol version: **2** (`PROTOCOL_VERSION`).

## Rules that hold for every message

- **Text frames of JSON only.** Binary frames are refused by the adapter before they reach the decoder.
- **Validated at the boundary.** Whatever receives a frame calls `decodeClientMessage` (server) or `decodeServerMessage` (client). Both return a result, never throw, and check the size before parsing. Whatever sends calls `encodeClientMessage` or `encodeServerMessage`, which validate too and throw `InvalidOutgoingMessageError` on a sender bug.
- **Strict objects.** An unknown field is an error, not ignored. That is what stops a client from sending `isHost: true` or a server from attaching `correct` to a question.
- **The server decides who a player is.** A client never sends its own player id or score. It sends a name, and a resume token if it is coming back.
- **The answer stays on the server until the question closes.** `question` has no `correct`, `explanation` or accepted forms. Only `reveal` carries them (review-checklist B3, tested in `test/answer-secrecy.test.ts`). The schema cannot see values, so one rule is for the worker: `score`, `answered` and `connected` in `room` must not reveal correctness, which means scores change only at `reveal`. The same holds for `room.tiebreak`: it changes only at a reveal (see [ADR 6](adr/0006-versus-game-rules.md)). The worker's secrecy test must check both.
- **Durations, not deadlines.** `durationMs` counts from the moment the client receives the question, because client clocks drift.
- **Image URLs are opaque paths under `/images/`**, made of plain-named segments (letters, digits and `_ ~ -`, then dots allowed after the first character), so there is no query, fragment, `%`, empty segment or `.` and `..` segment. The server should hand out names that do not spell out the answer.

## Limits

All in `src/limits.ts`; nothing else repeats the numbers.

| Limit                            | Value                               | Notes                                                                                                               |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Client message size              | 2 KiB                               | UTF-8 bytes, checked before parsing                                                                                 |
| Server message size              | 64 KiB                              | A reveal with every text at its maximum fits (tested)                                                               |
| Players per room                 | 8                                   | Provisional, see the roadmap                                                                                        |
| Player name                      | 1 to 24 characters                  | Trimmed; no control, format or unassigned characters                                                                |
| Typed answer                     | 1 to 200 characters                 | Sent as typed; the checker normalises it                                                                            |
| Parts in an image-group          | 1 to 100                            | Same constant as questions per game, as each part is one                                                            |
| Questions per game               | 1 to 100                            | Scored items; each part of an image-group counts on its own                                                         |
| Quizzes per game                 | 1 to 10                             | Distinct, ids like `fake-quiz-one`                                                                                  |
| Tie-break questions              | up to 5                             | Extra questions for a tie for first place                                                                           |
| Seconds per question             | 5 to 120                            |                                                                                                                     |
| Options per question             | 4                                   | As the real app's validator requires                                                                                |
| Room id, player id, resume token | 16 to 64 URL-safe characters        | The server generates them from a cryptographic source: at least 16 random bytes, written as 22 base64url characters |
| Item key                         | 1 to 64 (letters, digits, `_`, `-`) | Issued by the server, unique within a game (see below)                                                              |
| Quiz id                          | up to 64                            | Lowercase words joined by single hyphens                                                                            |
| Prompt                           | 1 to 2000                           |                                                                                                                     |
| Option                           | 1 to 500                            | Also the correct text and each accepted form                                                                        |
| Explanation                      | 1 to 2000                           |                                                                                                                     |
| Accepted forms                   | 1 to 4                              | Typed-answer reveals only                                                                                           |
| Image path                       | up to 512                           |                                                                                                                     |
| Error message                    | 1 to 200                            | For display only                                                                                                    |
| Players in a reveal or results   | 1 to 8                              | Same constant as players per room                                                                                   |

Units: message sizes are UTF-8 bytes. The player name counts characters (code points, so an emoji is 1). Every other text limit counts UTF-16 units, so an emoji is 2.

## Connection and handshake

The room is named by the connection URL (the invite link), not by a message. The first client message must be `join`.

```
client                                   server
  |  connect to /rooms/<roomId>            |
  |--------------- join ------------------>|  version, name, optional resumeToken
  |<-------------- welcome ----------------|  playerId, resumeToken
  |<-------------- room -------------------|  snapshot (also sent to everyone else)
```

A `join` with a different `protocolVersion` gets `error` `UNSUPPORTED_VERSION` and the connection closes. A client also checks the version in `welcome`.

## Client messages

| `type`   | Fields                                    | Who, when                                                         | Effect                                                    |
| -------- | ----------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `join`   | `protocolVersion`, `name`, `resumeToken?` | Anyone, first message                                             | Takes a seat, or takes a dropped seat back with the token |
| `start`  | `settings`                                | Host, in `lobby`                                                  | Starts the game                                           |
| `answer` | `itemKey`, `answer`                       | Any player, in `question` (in a tie-break, only the tied players) | Records the answer once                                   |
| `next`   | none                                      | Host, in `reveal`                                                 | Opens the next question, or ends with `results`           |
| `leave`  | none                                      | Any player                                                        | Gives up the seat for good                                |

`settings` is `{ quizIds, questionCount, secondsPerQuestion, answerBy }`. `answerBy: 'type'` asks for typed text where the answer can be checked automatically and falls back to multiple choice for the rest (see [fidelity.md](fidelity.md)).

`answer` is `{ kind: 'pick', index }` (0 to 3, the position in the options as the player saw them) or `{ kind: 'type', text }`. The `itemKey` must match the open question, so a slow answer to an earlier question is refused with `STALE_QUESTION`. Item keys are issued by the server (for example `i12`, `i12p2` for a part) and are unique within a game; they are not quiz ids, because ids repeat across the files of a mixed game.

A dropped connection is not a `leave`. The seat stays, shown as not connected, until the player resumes or the room ends. A valid `resumeToken` in `join` restores the seat in any phase, including after the results. A resumed player is sent `welcome`, then `room`, then the open `question` with the time left (if one is open), or `results` (if the game is over). In `reveal` it is sent the last `reveal` again, so it has something to show until the next question. In the lobby it is sent only `room`. The same applies to a late join, except after the results, where a new join gets `GAME_OVER`. A resumed player who had already answered the open question is not sent `answerAck` again: the client reads its own `answered` flag from `room`. The time left on a question is rounded up to at least 1 ms, and the server never sends a question that has already closed.

## Server messages

| `type`      | Fields                                                   | Sent when                                                    |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `welcome`   | `protocolVersion`, `roomId`, `playerId`, `resumeToken`   | After a valid `join`; to that player only                    |
| `room`      | `room` (see below)                                       | After every join, leave, disconnect, answer and phase change |
| `question`  | see below                                                | A question opens                                             |
| `answerAck` | `itemKey`                                                | A player's answer was accepted; to that player only          |
| `reveal`    | `itemKey`, `reason`, `correct`, `explanation`, `results` | A question closes                                            |
| `results`   | `standings`                                              | After the last reveal, or at once if a tie-break collapses   |
| `error`     | `code`, `message`                                        | A request was refused                                        |

**`room`** carries `roomId`, `phase` (`lobby`, `question`, `reveal`, `results`), `hostId`, `players`, `settings` (null until the game starts) and `tiebreak` (null unless a tie-break is under way: `{ round, playerIds }`, the players still tied for first place, who are the only ones asked). `hostId` can change during a game: when the host disconnects or leaves, the earliest-joined connected player becomes host, and a returning host does not take the role back ([ADR 7](adr/0007-core-state-machine.md)). Each player is `{ id, name, connected, answered, score }`. `answered` says a player has answered the open question and nothing about whether they were right.

**`question`** carries `mode` (`pick` or `type`), `progress`, `itemKey`, `prompt`, `durationMs`, and optionally `imageUrl` and `part` (`{ index, count }`, index from 1 and at most count, both at most 100, for an image-group of one or more parts). `progress` is `{ kind: 'regular', position, totalItems }` (position from 1, at most the total, each image-group part counting on its own) or `{ kind: 'tiebreak', round }` for an extra question asked only of the tied players. A `pick` question has `options`, exactly four, already shuffled. A `type` question has no options at all, because a list of options contains the answer.

**`reveal`** carries `reason` (`all-answered` or `timeout`) and `correct`: `{ kind: 'pick', index, text }` with the index into the shuffled options, or `{ kind: 'type', text, acceptedForms }`. In a tie-break, `results` lists only the tied players, so a watcher never appears as `no-answer`. Each entry of `results` is `{ playerId, outcome, near, points, score, answer }`. `outcome` is `correct`, `wrong` or `no-answer`; `near` marks a wrong typed answer within a letter or two of a right one (still wrong, as in the real app). `points` includes any multiplier, but the message does not say how it was computed; that is core's business.

**Wire details that follow from the rules.** `results` can follow an open question with no `reveal` for it: when a player leaves for good and a tie-break is left with fewer than two players, the game ends at once. A `reveal` lists only players who are still in the room, so a player who left during the question is absent. `ROOM_FULL` counts dropped seats, because they can be resumed. A late `answer` (at or after the deadline) closes the question as a timeout: the sender gets `error` `STALE_QUESTION`, then everyone gets the `reveal` and `room`. `NOT_HOST` is checked before `WRONG_PHASE`.

**`results`** carries `standings`, best first, each `{ playerId, name, rank, score, correctCount }`. Equal scores share a rank ([ADR 6](adr/0006-versus-game-rules.md)); a tie for first place is played off first.

## Errors

`error.code` is one of a fixed list (`ERROR_CODES`); clients branch on the code and show `message` as text only.

| Code                   | Meaning                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `MALFORMED_MESSAGE`    | Not JSON, not an object, unknown type, wrong or extra fields                             |
| `MESSAGE_TOO_LARGE`    | Over the size limit                                                                      |
| `UNSUPPORTED_VERSION`  | `join` or `welcome` from another protocol version                                        |
| `NOT_JOINED`           | A message other than `join` before joining                                               |
| `ALREADY_JOINED`       | A second `join` on the same connection                                                   |
| `INVALID_RESUME_TOKEN` | The token matches no seat in this room                                                   |
| `ROOM_NOT_FOUND`       | No such room                                                                             |
| `ROOM_FULL`            | The room has `MAX_PLAYERS_PER_ROOM` players                                              |
| `GAME_OVER`            | A new join after the results were shown (a resume token still restores its seat)         |
| `NOT_IN_TIEBREAK`      | `answer` from a player who is watching a tie-break                                       |
| `NOT_HOST`             | `start` or `next` from a player who is not the host                                      |
| `WRONG_PHASE`          | The message is not allowed in the current phase                                          |
| `INVALID_SETTINGS`     | Well-formed settings the server cannot honour (for example, too few questions available) |
| `STALE_QUESTION`       | `answer` for a question that is not the open one, including one that has just closed     |
| `ALREADY_ANSWERED`     | A second answer to the same question                                                     |
| `INVALID_ANSWER`       | `answer` of the wrong kind for the question's mode                                       |
| `RATE_LIMITED`         | Too many messages too fast                                                               |
| `INTERNAL_ERROR`       | Server fault; nothing the client did                                                     |

Decoding reports a failure as `{ ok: false, code, detail }`. `detail` names the field and the kind of problem and never repeats what the sender wrote, so it is safe to log.

## Game rules the protocol carries

The rules are in [ADR 6](adr/0006-versus-game-rules.md); `core` enforces them. What the wire needs for them:

- **Points.** `points` and `score` are whole numbers. A multiplier, when there is one, is applied by the server.
- **Closing early.** `reveal.reason` is `all-answered` or `timeout`.
- **Late joiners.** A `join` is accepted in any phase before the results. A player who joins while a question is open is sent that `question` with `durationMs` set to the time left. In a tie-break they only watch. A new join after the results gives `GAME_OVER`; a valid `resumeToken` restores the seat in any phase.
- **Ties.** Tie-break questions arrive as `question` messages with `progress.kind` of `tiebreak`, and `room.tiebreak` lists who is being asked. Everyone receives the question; a watcher who answers gets `NOT_IN_TIEBREAK`. Tie-break points count in `score` and `correctCount`. `rank` in `results` is a plain number; equal scores share one.

## Version history

- **2:** a question's `position` and `totalItems` became `progress` (`regular` or `tiebreak`); `room.tiebreak` was added; `GAME_IN_PROGRESS` became `GAME_OVER`; `NOT_IN_TIEBREAK` was added. Limits tightened later without a bump, because nothing is deployed: item keys are server-issued and at most 64 plain characters, image paths allow only plain-named segments, and image-group part numbers are at most 100.
- **1:** first version.

## Changing the protocol

Objects are strict, so adding a field is a breaking change for an older peer. Nothing has been deployed yet, so no peer runs an old version; the version still marks every shape change. Any change to a message shape bumps `PROTOCOL_VERSION` (adding, removing or retyping a field; tightening or loosening a limit, or the characters a field allows, is not a shape change), updates this page, `test/samples.ts` and the version history above, and notes the change in the pull request. Because client and server ship together in this mock there is no compatibility window to maintain; a real deployment would need one (see the lessons).
