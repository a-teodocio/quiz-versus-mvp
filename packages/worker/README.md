# @quiz-versus/worker

The game server for versus mode: a plain Node process that holds every room in memory and talks to browsers over WebSockets (`ws`). The package keeps the name `worker` from the Cloudflare plan it replaced; a rename to `server` is its own branch.

It is an adapter. All game rules are in `@quiz-versus/core`; every message shape is in `@quiz-versus/protocol`. This package supplies what those two must not touch: sockets, timers, the clock, secure random ids, and quiz files and pictures read from disk.

## Dependencies

- May import: `@quiz-versus/core`, `@quiz-versus/protocol`, Node built-ins and the packages listed in `package.json`.
- Must not import: `@quiz-versus/web` or `@quiz-versus/quiz-validator`. ESLint blocks both.

## Running it

Packages export built JavaScript to plain Node, so build first: `npm run build`.
