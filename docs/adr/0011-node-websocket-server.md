# 11. A plain Node WebSocket server instead of Cloudflare

Status: accepted (2026-11-02). Supersedes [ADR 2](0002-cloudflare-durable-objects-for-rooms.md).

## Context

ADR 2 chose one Cloudflare Durable Object per room, behind a Worker, with the site on Cloudflare Pages. Building it showed that the toolchain does not fit the repo's own rules:

- `wrangler` 4.151.1, the newest release at least 14 days old, fails `npm audit --audit-level=high` (`undici` 7.29.1, pinned by `miniflare`, fixed in 7.30.1) and adds install scripts (`esbuild`, `workerd`). Every older 4.x release checked (4.40 to 4.151) and 3.114.17 is also affected, and 3.x audits worse. See [dependency-vetting.md](../dependency-vetting.md).
- Running a Durable Object at all needs the real Workers runtime, and its test runner (`@cloudflare/vitest-pool-workers`) needs Vitest 4 while the repo is on 5.
- The host is not decided. A plain Node server runs on any host, and `core` and `protocol` do not change, so a Cloudflare adapter stays possible later.

Cost was not the reason: the Workers Free plan could have carried the app.

## Decision

**One Node process holds every room in memory.** `packages/worker` (the name stays; a rename to `server` is its own branch, because the qa-guard and several documents name `packages/worker/test/qa/`) is a Node HTTP server with `ws` 8.22.0 for WebSockets. Each room is one `RoomSession` from `core`. The server carries out the effects the state machine returns, and nothing else decides a game rule.

**Routes.** A known path with the wrong method is `405`; any other path is `404`; a fault is `500`.

| Route                                      | What it does                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /rooms`                              | Makes a room and answers `201` with `{ "roomId": "<id>" }`. The id is 22 base64url characters from a cryptographic source, so a room cannot be found by guessing. `503` when the server holds its maximum number of rooms (`SERVER_FULL`) or the sender's address has its share (`TOO_MANY_ROOMS`); `403` for an origin that is not allowed. |
| `GET /rooms/<id>` with a WebSocket upgrade | The connection a player plays on. A room that was never made, or has closed, still completes the upgrade, receives one `error` `ROOM_NOT_FOUND` and is closed, so the client can read the code.                                                                                                                                              |
| `GET /images/<alias>`                      | A picture of a game in progress. The alias is the opaque name core issued; it is looked up across all rooms (see below).                                                                                                                                                                                                                     |

**Origin check.** A browser always sends `Origin` on a WebSocket upgrade and on a cross-site `POST`. If the header is present and not in the allowed list, the request is refused with `403` before the upgrade. A request with no `Origin` (a script or a test client) is allowed: the check exists to stop other websites using a visitor's browser, which always sends it. The server's own origin (the `Origin` host equals the `Host` header) is always allowed; others, such as a development server for the web client, come from the `ALLOWED_ORIGINS` setting.

**Images across rooms.** Core issues `/images/<alias>` and keeps the alias to file mapping in the game plan. The server keeps one index of alias to file for all rooms, added when a game starts and removed when its room closes, so a closed room leaves nothing behind. An alias is 16 random characters, so two rooms issuing the same one is vanishingly unlikely, but it is handled: if a new plan holds an alias already in the index, the server prepares the game again (up to 3 tries) and answers `INTERNAL_ERROR` if it still collides. Files are read only from inside the content `images/` folder, with links resolved before the check, and `content/` is never served as a folder.

**Limits that the decoders do not hold.** Players per room already comes from core. The server adds: a cap on rooms in memory, an idle-room time limit (a room with nobody connected is closed after it), a message rate per connection (`MAX_MESSAGES_PER_WINDOW` in a window, both in `protocol/src/limits.ts`, answered with `RATE_LIMITED` and, if it continues, a close), and `maxPayload` just above `MAX_CLIENT_MESSAGE_BYTES` so an oversize message reaches the decoder and gets `MESSAGE_TOO_LARGE` instead of an anonymous close. Binary frames are refused. A ping and pong heartbeat turns a silent connection into a `disconnect`.

**Time and randomness stay injected.** The server has a `Scheduler` port (set a timer, clear it) beside core's `Clock`; one game timer per room, an idle timer per room, a join deadline per unjoined socket and one heartbeat for the process, all cleared when their room closes. Tests drive both by hand. `Random` is backed by `crypto.getRandomValues`, as ADR 7 requires.

## Consequences

- **The origin check does not stop DNS rebinding.** The server's own origin is allowed when the `Origin` host equals the `Host` header, and after a rebind both name the attacker's domain. On a loopback server a hostile page could then make and play rooms. The content is fake and the server binds loopback by default, so this is accepted for now ([known-issues.md](../known-issues.md)); before a real deployment, compare `Host` with a configured list.

- **A restart or a deploy ends every room and every resume token.** Nothing is stored. Players see the connection fail and must start again. This is acceptable for a trial and is the main thing a real deployment would have to design differently (state in a database or a store, or sticky routing).
- No scale to zero, no free hosting tier by default, no Cloudflare Access for email-based sign-in. One process is also one point of failure and has a ceiling, which the room cap makes visible.
- `core` and `protocol` are unchanged by this decision. A Cloudflare adapter would reimplement only `packages/worker`.
- The server runs under plain Node, so it uses the built JavaScript of the packages (`npm run build` first), as [folder-structure.md](../folder-structure.md) explains.
- ADR 2 gets a status line pointing here and nothing else. Its reasoning about peer-to-peer and client-side game logic still holds.
- `architecture.md`, `engineering-practices.md` and `folder-structure.md` are updated in the same branch, and `protocol.md` gains the HTTP routes.
