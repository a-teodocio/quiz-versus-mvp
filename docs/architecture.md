# Architecture

Status: `protocol`, `core` and `quiz-validator` are built; `worker` and `web` are planned. This document is the contract they are built to.

## Packages

```
packages/
  protocol/   message types + zod schemas shared by server and client
  core/       pure game logic: room state machine, scoring, seeded shuffle, quiz model
  worker/     Cloudflare Worker + Durable Object: WebSocket adapter, quiz loading, clock/random
  web/        browser app: quiz UI (forked from the real app) + versus client
  quiz-validator/  authoring tool: checks content/ against the real app's validator rules
```

## Dependency rule

```
web ──────┐
          ├──> protocol <── core
worker ───┘                    ^
   └───────────────────────────┘
```

- `core` imports only from `protocol` (types and constants such as limits). No `node:*`, no Cloudflare APIs, no other package.
- `protocol` imports nothing from the repo.
- `worker` and `web` may import `core` and `protocol`, never each other.
- `web` talks to the server only through `protocol` messages over a WebSocket.

`quiz-validator` may import `core` and `protocol`, and nothing imports it (it is run by the tests and by `npm run validate:content`). Its checks take a `ContentTree` as data; only `src/disk/` uses `node:*` ([ADR 10](adr/0010-quiz-validator-package.md)).

ESLint (`eslint.config.js`) fails the build when a package imports something it should not.

## Ports and adapters

`core` owns small interfaces; adapters implement them.

| Port (in `core`) | Purpose                    | Production adapter    | Test adapter     |
| ---------------- | -------------------------- | --------------------- | ---------------- |
| `Clock`          | current time, timers       | Durable Object alarms | manual clock     |
| `Random`         | randomness                 | crypto-backed source  | fixed sequence   |
| `QuizRepository` | load quizzes and their key | static JSON assets    | in-memory        |
| `Logger`         | structured logs            | console wrapper       | collecting array |

## Game room

One room is one Durable Object instance holding one `core` room state. The state machine:

```
LOBBY ──start──> QUESTION ──all answered or timeout──> REVEAL ──next──> QUESTION
                                                          ├──tie for first──> QUESTION (tie-break, up to 5)
                                                          └──last──> RESULTS
(a tie-break question can also go straight to RESULTS: if a tied player leaves and fewer than two are left)
```

The wire phases stay these four; the tie-break is a question phase for the tied players only ([ADR 6](adr/0006-versus-game-rules.md)). The shape of the state machine, who prepares the game and how time and effects work are in [ADR 7](adr/0007-core-state-machine.md).

- The server holds the correct answers. Clients receive them only in `REVEAL`.
- All inputs (join, leave, answer, start, next, disconnect, timer fired) are events applied to the pure `step` function, which returns the new state and effects (messages to send, a timer to set or clear). This makes every behaviour testable without a network. `RoomSession` adds the clock and logging around it.

## Data

Quiz files use the real app's JSON schema (text, image and image-group entries; `correct` indexes the unshuffled options). Content is fake and lives in `content/` (see [content/README.md](../content/README.md)); `quiz-validator` checks it in `npm run check`. See [fidelity.md](fidelity.md) for where the mock simplifies the real app.
