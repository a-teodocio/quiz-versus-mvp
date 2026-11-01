# Protocol

Every message between the browser and the server, over one WebSocket per player. The schemas live in `packages/protocol` and are the source of truth; this page explains them. Message types are derived from the schemas with `z.infer`, so the code and the types cannot drift apart.

Protocol version: **1** (`PROTOCOL_VERSION`).

## Rules that hold for every message

- **Text frames of JSON only.** Binary frames are refused by the adapter before they reach the decoder.
- **Validated at the boundary.** Whatever receives a frame calls `decodeClientMessage` (server) or `decodeServerMessage` (client). Both return a result, never throw, and check the size before parsing. Whatever sends calls `encodeClientMessage` or `encodeServerMessage`, which validate too and throw `InvalidOutgoingMessageError` on a sender bug.
- **Strict objects.** An unknown field is an error, not ignored. That is what stops a client from sending `isHost: true` or a server from attaching `correct` to a question.
- **The server decides who a player is.** A client never sends its own player id or score. It sends a name, and a resume token if it is coming back.
- **The answer stays on the server until the question closes.** `question` has no `correct`, `explanation` or accepted forms. Only `reveal` carries them (review-checklist B3, tested in `test/answer-secrecy.test.ts`).
- **Durations, not deadlines.** `durationMs` counts from the moment the client receives the question, because client clocks drift.
- **Image URLs are opaque, same-origin paths** (`/images/...`). The server should hand out names that do not spell out the answer.

## Limits

All in `src/limits.ts`; nothing else repeats the numbers.

| Limit                            | Value                        | Notes                                                       |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Client message size              | 2 KiB                        | UTF-8 bytes, checked before parsing                         |
| Server message size              | 64 KiB                       | A reveal with every text at its maximum fits (tested)       |
| Players per room                 | 8                            | Provisional, see the roadmap                                |
| Player name                      | 1 to 24 characters           | Trimmed; no control, format or unassigned characters        |
| Typed answer                     | 1 to 200 characters          | Sent as typed; the checker normalises it                    |
| Questions per game               | 1 to 100                     | Scored items; each part of an image-group counts on its own |
| Quizzes per game                 | 1 to 10                      | Distinct, ids like `fake-quiz-one`                          |
| Seconds per question             | 5 to 120                     |                                                             |
| Options per question             | 4                            | As the real app's validator requires                        |
| Room id, player id, resume token | 16 to 64 URL-safe characters | The server generates them from a cryptographic source       |

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

| `type`   | Fields                                    | Who, when                 | Effect                                                    |
| -------- | ----------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `join`   | `protocolVersion`, `name`, `resumeToken?` | Anyone, first message     | Takes a seat, or takes a dropped seat back with the token |
| `start`  | `settings`                                | Host, in `lobby`          | Starts the game                                           |
| `answer` | `itemKey`, `answer`                       | Any player, in `question` | Records the answer once                                   |
| `next`   | none                                      | Host, in `reveal`         | Opens the next question, or ends with `results`           |
| `leave`  | none                                      | Any player                | Gives up the seat for good                                |

`settings` is `{ quizIds, questionCount, secondsPerQuestion, answerBy }`. `answerBy: 'type'` asks for typed text where the answer can be checked automatically and falls back to multiple choice for the rest (see [fidelity.md](fidelity.md)).

`answer` is `{ kind: 'pick', index }` (0 to 3, the position in the options as the player saw them) or `{ kind: 'type', text }`. The `itemKey` must match the open question, so a slow answer to an earlier question is refused with `STALE_QUESTION`.

A dropped connection is not a `leave`. The seat stays, shown as not connected, until the player resumes or the room decides otherwise (core).

## Server messages

| `type`      | Fields                                                   | Sent when                                                    |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `welcome`   | `protocolVersion`, `roomId`, `playerId`, `resumeToken`   | After a valid `join`; to that player only                    |
| `room`      | `room` (see below)                                       | After every join, leave, disconnect, answer and phase change |
| `question`  | see below                                                | A question opens                                             |
| `answerAck` | `itemKey`                                                | A player's answer was accepted; to that player only          |
| `reveal`    | `itemKey`, `reason`, `correct`, `explanation`, `results` | A question closes                                            |
| `results`   | `standings`                                              | After the last reveal                                        |
| `error`     | `code`, `message`                                        | A request was refused                                        |

**`room`** carries `roomId`, `phase` (`lobby`, `question`, `reveal`, `results`), `hostId`, `players` and `settings` (null until the game starts). Each player is `{ id, name, connected, answered, score }`. `answered` says a player has answered the open question and nothing about whether they were right.

**`question`** carries `mode` (`pick` or `type`), `position` and `totalItems`, `itemKey`, `prompt`, `durationMs`, and optionally `imageUrl` and `part` (`{ index, count }`, both from 1, for an image-group). A `pick` question has `options`, exactly four, already shuffled. A `type` question has no options at all, because a list of options contains the answer.

**`reveal`** carries `reason` (`all-answered` or `timeout`) and `correct`: `{ kind: 'pick', index, text }` with the index into the shuffled options, or `{ kind: 'type', text, acceptedForms }`. Each entry of `results` is `{ playerId, outcome, near, points, score, answer }`. `outcome` is `correct`, `wrong` or `no-answer`; `near` marks a wrong typed answer within a letter or two of a right one (still wrong, as in the real app). `points` includes any speed bonus, but the message does not say how it was computed; that is core's business.

**`results`** carries `standings`, best first, each `{ playerId, name, rank, score, correctCount }`. Equal scores share a rank.

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
| `GAME_IN_PROGRESS`     | Joining after the game started (whether to allow it is still open)                       |
| `NOT_HOST`             | `start` or `next` from a player who is not the host                                      |
| `WRONG_PHASE`          | The message is not allowed in the current phase                                          |
| `INVALID_SETTINGS`     | Well-formed settings the server cannot honour (for example, too few questions available) |
| `STALE_QUESTION`       | `answer` for a question that is not the open one                                         |
| `ALREADY_ANSWERED`     | A second answer to the same question                                                     |
| `INVALID_ANSWER`       | `answer` of the wrong kind for the question's mode                                       |
| `RATE_LIMITED`         | Too many messages too fast                                                               |
| `INTERNAL_ERROR`       | Server fault; nothing the client did                                                     |

Decoding reports a failure as `{ ok: false, code, detail }`. `detail` names the field and the kind of problem and never repeats what the sender wrote, so it is safe to log.

## What the protocol leaves open

The protocol allows both answers to these questions from the roadmap; core and the worker decide, and the choice is recorded where it is made.

- **Scoring and the speed bonus.** `points` and `score` are plain numbers.
- **Closing early.** `reveal.reason` can be `all-answered` or `timeout`.
- **Late joiners.** `GAME_IN_PROGRESS` exists if they are refused.
- **Ties.** `rank` is on the server's side of the wire; equal scores can share one.

## Changing the protocol

Objects are strict, so adding a field is a breaking change for an older peer. Any change to a message shape bumps `PROTOCOL_VERSION`, updates this page and `test/samples.ts`, and notes the change in the pull request. Because client and server ship together in this mock there is no compatibility window to maintain; a real deployment would need one (see the lessons).
