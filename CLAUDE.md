# quiz-versus-mvp: working rules for Claude

Mock of a local MLS quiz app, used to trial a live multiplayer (versus) mode before building it for real. The mock data is fake; the code is written to production standards so it can be ported.

## Hard rules

- **Public repo.** Never add real course content, real quiz questions, real images or personal notes. Fake and placeholder content only. Do not add the user's email or any private path from outside this repo to any file.
- **Fidelity.** The mock must behave like the real app (question schema, image-groups, typed answers, option shuffle, progress keys). Every deliberate simplification is recorded in `docs/fidelity.md` as it is made.
- **Writes stay in this repo.** Reading the real app (`knowledge training` in the user's vault) is allowed for reference; copy code and rules, never quiz files or images.
- **Git.** Work on a branch (`feat/`, `fix/`, `chore/`, `docs/`), never commit to `main` directly. Conventional Commits. Push branches as needed. Merge to `main` only through a pull request that the user merges (the `gh` CLI may not be installed). Delete merged branches.
- **Vet third-party packages.** Before adding or upgrading any dependency, follow `docs/dependency-vetting.md`: only versions at least 14 days old (`npm install --before=<date>`), `npm audit --audit-level=high` clean, `npm audit signatures` clean, no new install scripts. Tell the user about anything that fails and record accepted moderate findings in `docs/known-issues.md`.
- **No em dashes** in any text. Use a colon, comma, full stop or brackets.

## Read first

1. `docs/engineering-practices.md`: the standards every change follows.
2. `docs/architecture.md`: layers and the dependency rule (enforced by ESLint).
3. `docs/adr/`: why the big decisions were made. Add an ADR for any new one.
4. `docs/fidelity.md`: where the mock differs from the real app.

## Commands

```
npm run check      # lint + format check + typecheck + tests (run before every push)
npm run lint
npm run format
npm run typecheck
npm run test
npm run build
```

Node is pinned in `.nvmrc`. Commit hooks run lint-staged and commitlint; never skip them.

## Finishing a task

Update the docs the change touches (README, architecture, protocol, ADR, fidelity), run `npm run check`, push the branch, and tell the user what to merge.
