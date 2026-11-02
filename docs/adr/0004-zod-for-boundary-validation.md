# 4. zod for validating messages at the boundary

Status: accepted (2026-11-01). Extended by [ADR 12](0012-zod-for-quiz-files-in-the-server.md), which lets the server use zod for quiz files.

## Context

Every message from a browser is untrusted input. The engineering practices require one schema per message, parsed where the message enters, with the TypeScript types derived from the schema so the two cannot disagree. TypeScript types alone are erased at runtime and check nothing.

## Decision

Use `zod` (4.6.7, published 2026-10-12) in `packages/protocol` only. Schemas are strict objects, messages are a discriminated union on `type`, and types come from `z.infer`. Callers use the package's decoders and encoders, not the schemas, so zod does not appear in other packages' code.

The dependency was vetted under [dependency-vetting.md](../dependency-vetting.md): the version is older than 14 days, `npm audit` is clean, registry signatures verify, and it has no install script. It has no runtime dependencies of its own.

## Consequences

- One declaration gives the runtime check and the type, and the schemas can be read as the specification.
- The package is bundled into the Worker and the browser, so its size counts. Measure the bundles when `worker` and `web` exist, and revisit this if size matters.
- Switching library later is contained: the schemas and codec are the only code that knows zod. The decoders' result type is ours.
- Alternatives considered: hand-written type guards (long, easy to get out of step with the types), and Valibot or TypeBox (not evaluated in depth; zod was chosen as the widely used default).
