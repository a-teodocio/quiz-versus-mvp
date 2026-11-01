# Architecture

Status: planned. The packages below do not exist yet; this document is the contract they are built to.

## Packages

```
packages/
  protocol/   message types + zod schemas shared by server and client
  core/       pure game logic: room state machine, scoring, seeded shuffle, quiz model
  worker/     Cloudflare Worker + Durable Object: WebSocket adapter, quiz loading, clock/random
  web/        browser app: quiz UI (forked from the real app) + versus client
```

## Dependency rule

```
web ──────┐
          ├──> protocol <── core
worker ───┘                    ^
   └───────────────────────────┘
```

- `core` imports only types from `protocol`. No `node:*`, no Cloudflare APIs, no other package.
- `protocol` imports nothing from the repo.
- `worker` and `web` may import `core` and `protocol`, never each other.
- `web` talks to the server only through `protocol` messages over a WebSocket.

ESLint (`eslint.config.js`) fails the build when a package imports something it should not.

## Ports and adapters

`core` owns small interfaces; adapters implement them.

| Port (in `core`) | Purpose                    | Production adapter    | Test adapter     |
| ---------------- | -------------------------- | --------------------- | ---------------- |
| `Clock`          | current time, timers       | Durable Object alarms | manual clock     |
| `Random`         | seeded randomness          | seeded PRNG           | fixed sequence   |
| `QuizRepository` | load quizzes and their key | static JSON assets    | in-memory        |
| `Logger`         | structured logs            | console wrapper       | collecting array |

## Game room

One room is one Durable Object instance holding one `core` room state. The state machine:

```
LOBBY ──start──> QUESTION ──all answered or timeout──> REVEAL ──next──> QUESTION
                                                          └──last──> RESULTS
```

- The server holds the correct answers. Clients receive them only in `REVEAL`.
- All inputs (join, leave, answer, start, disconnect, timer fired) are events applied to the state machine, which returns the new state and the messages to send. This makes every behaviour testable without a network.

## Data

Quiz files use the real app's JSON schema (text, image and image-group entries; `correct` indexes the unshuffled options). Content is fake. See [fidelity.md](fidelity.md) for where the mock simplifies the real app.
