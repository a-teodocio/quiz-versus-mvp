# 12. The server parses quiz files with zod

Status: accepted (2026-11-02). Extends [ADR 4](0004-zod-for-boundary-validation.md).

## Context

ADR 4 keeps zod in `packages/protocol` only, so no other package spells out a schema. A quiz file read from disk is also input that crosses a boundary (review-checklist B1), and `core` types it (`Quiz`) without checking it. The server is where files enter, so it has to check them before `prepareGame` sees them. `prepareGame` already refuses a question the protocol cannot carry, but it assumes the file has the right shape.

Two ways to do it were open: add a `decodeQuizFile` to `protocol`, or let the server use zod for content files.

## Decision

The server (`packages/worker`) declares zod schemas for the quiz file shape, in one module, and uses them only where a file is read. They describe the real app's schema (text, image and image-group entries, `correct` indexing the unshuffled options, `image_path`) and produce the `Quiz` type from `core` (the schema is checked against the type at compile time).

`protocol` is not changed. A quiz file is not a message between a browser and a server, and putting it in `protocol` would make that package describe the real app's authoring format.

The schema checks shape and size only: the right fields, the right types, a bounded number of entries and parts, and bounded text. The content rules of the real validator (wording, picture widths) stay in `quiz-validator`, and `prepareGame` keeps refusing what a game cannot carry.

## Consequences

- `zod` becomes a direct dependency of `packages/worker` as well as `protocol`. It is already vetted and installed (one copy).
- Where zod may be used is now: message shapes in `protocol`, quiz file shapes in the server's content module. Anything else needs an ADR.
- Two descriptions of the quiz file shape exist (core's types and this schema). A compile-time check keeps them equal, and a test loads every file in `content/` through the schema.
- A file that fails the schema is an `INTERNAL_ERROR` for the game that asked for it (a content fault, not the host's mistake), is logged with the file name but never its text, and does not stop the server.
