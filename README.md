# quiz-versus-mvp

A mock of a local quiz app, used to trial a live multiplayer (versus) mode: send a friend an invite link, join a room, and compete on the same random set of questions.

The quiz content is entirely fake. The code is written to production standards so the lessons, and much of the code, can carry over to the real app.

## Status

Early. Tooling, CI, docs and the message protocol (`packages/protocol`) are in place; `packages/core` (the game logic) is built, as is `packages/quiz-validator` with the fake content it checks (`content/`); `packages/worker` (the Node game server) is built; `web` comes next. See [docs/roadmap.md](docs/roadmap.md) for the plan.

## Quickstart

Requires Node 24 (see `.nvmrc`).

```
npm ci
npm run check
```

| Command                    | What it does                                         |
| -------------------------- | ---------------------------------------------------- |
| `npm run check`            | lint, format check, typecheck and tests              |
| `npm run lint`             | ESLint, including the layer rules                    |
| `npm run format`           | Prettier, writes files                               |
| `npm run typecheck`        | TypeScript across all packages                       |
| `npm run test`             | tests across all packages                            |
| `npm run build`            | build all packages                                   |
| `npm run validate:content` | check `content/` against the real validator's rules  |
| `npm run qa:start`         | build and start the game server in the background    |
| `npm run qa:stop`          | stop it                                              |
| `npm run qa:ws`            | run the QA tester's server tests against that server |

## Documentation

- [Roadmap and status](docs/roadmap.md): where the project stands and what comes next
- [Engineering practices](docs/engineering-practices.md): the standards every change follows
- [Folder structure](docs/folder-structure.md): where things live and how to add more
- [Review checklist](docs/review-checklist.md): what every change is reviewed against
- [Dependency vetting](docs/dependency-vetting.md): how third-party packages are checked
- [Architecture](docs/architecture.md): packages, layers, game-room state machine
- [Protocol](docs/protocol.md): every client and server message
- [Architecture decisions](docs/adr/): why things are the way they are
- [Fidelity log](docs/fidelity.md): where the mock differs from the real app
- [Fake content](content/README.md): the quizzes and pictures the mock plays
- [Known issues](docs/known-issues.md)

## Contributing

Work on a branch (`feat/`, `fix/`, `chore/`, `docs/`), use Conventional Commits, open a pull request, and wait for CI. Details in the engineering practices doc.

## Licence

MIT
