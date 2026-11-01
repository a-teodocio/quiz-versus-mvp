# 2. Cloudflare Workers and Durable Objects for game rooms

Status: accepted (2026-11-01)

## Context

Versus mode needs live play for two or more players, with robust and scalable rooms. A static host (GitHub Pages) has no server. Peer-to-peer (WebRTC) works for two players but is fragile for more and cannot hide answers. Supabase or Firebase realtime channels need no server code but run game logic in a client, so answers reach every player.

## Decision

One Durable Object per room, reached over WebSocket from a Worker. The static site is served by Cloudflare Pages. The server is authoritative: it holds the correct answers and reveals them only when a question closes.

## Consequences

- Server-side scoring and no client-side cheating via the quiz JSON.
- One platform for hosting, realtime and (later, for the real app) email-based access control.
- New codebase in TypeScript beside the existing Python app.
- Free-tier limits must be re-checked before relying on them.
- Alternative kept in view: Supabase Realtime, if score history or accounts become the priority.
