# 3. TypeScript with npm workspaces and enforced layers

Status: accepted (2026-11-01)

## Context

The real app is Python plus one large plain-JS page. The new code needs shared message types between Worker and browser, and a way to stop layers from tangling.

## Decision

TypeScript in strict mode, split into npm workspaces (`protocol`, `core`, `worker`, `web`). The dependency rule between them is enforced by ESLint `no-restricted-imports`, not only documented.

## Consequences

- A compile step and tooling the Python app does not have.
- The protocol is typed once and used on both sides.
- Layer violations fail CI.
- Parity with the real app's behaviour is checked by tests using fixtures copied into this repo (with the source commit recorded), because CI cannot see the user's vault.
