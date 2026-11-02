# @quiz-versus/worker

The game server for versus mode: a plain Node process that holds every room in memory and talks to browsers over WebSockets (`ws`). The package keeps the name `worker` from the Cloudflare plan it replaced ([ADR 11](../../docs/adr/0011-node-websocket-server.md)); a rename to `server` is its own branch.

It is an adapter. All game rules are in `@quiz-versus/core`; every message shape is in `@quiz-versus/protocol`. This package supplies what those two must not touch: sockets, timers, the clock, secure random ids, and quiz files and pictures read from disk.

## Running it

Packages export built JavaScript to plain Node, so build first.

```
npm run build
node packages/worker/dist/src/main.js
```

or `npm run qa:start` / `npm run qa:stop` (a background copy for the QA tester; see [docs/qa-scenarios.md](../../docs/qa-scenarios.md)).

Settings come from environment variables (`loadConfig`): `PORT` (default 8787), `HOST` (default `127.0.0.1`, loopback only; set `0.0.0.0` to accept other machines), `CONTENT_ROOT` (default `./content`), `ALLOWED_ORIGINS` (comma-separated, besides the server's own), `MAX_ROOMS`, `MAX_ROOMS_PER_ADDRESS`, `IDLE_ROOM_MS`, `HEARTBEAT_MS`. A value that makes no sense stops the server at start. The routes and the WebSocket handshake are in [docs/protocol.md](../../docs/protocol.md).

Every room lives in this one process. A restart ends every room and every resume token.

## Public API

Everything is exported from `src/index.ts`; `src/main.ts` is the command that runs the server.

- `startServer(config, deps)` builds the server and starts listening; it returns `{ port, roomCount, close }`. `deps` is the clock, scheduler, random source, id source and logger, so a test replaces all five.
- `loadConfig(env, currentDirectory)` and the `ServerConfig` type.
- The production adapters: `systemClock`, `systemScheduler`, `cryptoIds`, `cryptoRandom`, `createJsonLogger`.
- The ports the server owns: `Scheduler`, `IdSource`, `ServerLogger`.

## Layout

```
src/
  config/     limits and defaults, the settings read from the environment
  content/    quiz files and pictures from disk (checked with zod, ADR 12), the picture-name index
  net/        origin check, rate limiter, heartbeat, HTTP routes, WebSocket upgrade, socket binding
  platform/   production clock, scheduler, ids, random, JSON logger
  ports/      Scheduler, IdSource, ServerLogger
  rooms/      one room (RoomHost), the registry of rooms, game set-up
  server/     puts the parts together and listens
test/         tests with real sockets on a free port, and the helpers they share
test/qa/      written by the qa-tester (created by its first run)
```

## Dependencies

- May import: `@quiz-versus/core`, `@quiz-versus/protocol`, `zod` (quiz files only, ADR 12), `ws`, and Node built-ins.
- Must not import: `@quiz-versus/web` or `@quiz-versus/quiz-validator`. ESLint blocks both.

## Tests

```
npm test -- packages/worker
```

- Next to the code: the config, the platform adapters, the quiz-file schema, the repository and the picture store, the picture-name index, the origin check and rate limiter, and the room (`room-host.*.test.ts`, with fake sockets and manual time).
- `test/server.*.test.ts`: the real server on port 0 with real WebSocket clients: routes and origin, frame sizes, binary frames, rate limit and heartbeat, whole games, reconnecting, leaving, pictures, shutting down.
- Time is manual in all of them (`test/support/manual-time.ts` is both the clock and the scheduler), randomness is seeded, and ids count up. Waiting is for messages to arrive, never for time to pass.
