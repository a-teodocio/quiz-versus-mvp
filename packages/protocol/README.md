# @quiz-versus/protocol

The messages a versus-mode client and server exchange, as zod schemas, with types derived from them. The messages themselves are described in [docs/protocol.md](../../docs/protocol.md).

## Public API

Everything is exported from `src/index.ts`. Nothing else in the package may be imported from outside it.

- `decodeClientMessage(text)` and `decodeServerMessage(text)`: check the size, parse the JSON, validate, and return `{ ok: true, message }` or `{ ok: false, code, detail }`. They never throw.
- `encodeClientMessage(message)` and `encodeServerMessage(message)`: validate and return the text to send. They throw `InvalidOutgoingMessageError` when the sender built a message the protocol does not allow.
- The types `ClientMessage`, `ServerMessage`, `GameSettings`, `RoomSnapshot`, `PlayerSummary`, `RoomPhase`, `Answer`, `QuestionMessage`, `RevealMessage`, `ResultsMessage`, `ErrorCode`, `DecodeResult`.
- `PROTOCOL_VERSION`, `ERROR_CODES` and the named limits (`MAX_PLAYERS_PER_ROOM`, `PLAYER_NAME_MAX_LENGTH`, and so on).

The schemas themselves are internal. Callers go through the decoders and encoders so every message is validated the same way.

## Dependencies

- May import: `zod` only.
- Must not import: any other workspace package (`core`, `worker`, `web`), `node:*` or Cloudflare APIs. ESLint enforces this.

`package.json` points `exports` at `src/index.ts`. Consumers are bundled or run through TypeScript tooling (Wrangler, Vite, Vitest), so there is no build step to keep in sync.

## Tests

```
npm test -- packages/protocol
```

- `src/**/*.test.ts`: unit tests next to the code.
- `test/samples.ts`: one valid example of every message; the other tests mutate these.
- `test/answer-secrecy.test.ts`: a question cannot carry the answer.
- `test/boundaries.test.ts`, `test/settings-and-question.test.ts`: limits and edge cases.
- `test/codec.test.ts`: round trips, rejections and the size limit.
