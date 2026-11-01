# Dependency vetting

Every third-party package is checked before it is added and again on every CI run. The aim is to catch known vulnerabilities and supply-chain attacks, which hit hardest in the first days after a release.

## Before adding or upgrading a package

1. **Need.** Prefer the platform or existing dependencies. Record notable choices in an ADR.
2. **Provenance.** The package comes from the public npm registry, has a known maintainer or organisation, and a source repository.
3. **Release age.** Use only versions published at least 14 days ago, so a malicious or broken release is usually found and pulled first. Install with `npm install --before=<date 14 days ago> <package>`.
4. **Advisories.** `npm audit --audit-level=high` reports nothing. Moderate and low findings are allowed only if recorded in [known-issues.md](known-issues.md) with their impact.
5. **Signatures.** `npm audit signatures` verifies registry signatures and provenance attestations for every installed package.
6. **Install scripts.** Packages that run code at install time are listed in the lockfile with `hasInstallScript`. New ones need a reason. CI installs with `--ignore-scripts`.
7. **Maintenance.** Not deprecated, actively maintained, no recent change of ownership.

## Automated checks

- CI: `npm ci --ignore-scripts`, `npm audit --audit-level=high` (fails on high or critical), `npm audit signatures`.
- Dependabot: weekly version updates and security updates, with a 14-day cooldown on new releases (`.github/dependabot.yml`).
- GitHub Actions are pinned to a full commit SHA with the version in a trailing comment (a tag can be moved; a SHA cannot). Dependabot updates the SHA and the comment together. Review each upgrade's release notes.
- `package-lock.json` is written by npm only and keeps npm's 2-space format (it follows the indentation of `package.json`). Never reformat it by hand or with Prettier, or Dependabot PRs rewrite the whole file.

## Current state (2026-11-01)

- No high or critical advisories.
- All installed packages have verified registry signatures.
- The only package with an install script is `fsevents`, an optional macOS file watcher, which does not run on Windows or Linux.
- Direct dev dependencies were installed with a cutoff of 2026-10-17 (a 14-day cooldown).
- Open moderate findings: see [known-issues.md](known-issues.md).
- Actions: `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0, both from the official `actions` organisation, released more than 14 days ago, pinned by SHA.

## Log of vetted updates

| Date       | Update                                                         | Result                                                                                                                                                             |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-01 | `@commitlint/cli` and `config-conventional` 21.2.3 to 21.2.4   | Accepted: 14 days old, signed, patch release                                                                                                                       |
| 2026-11-01 | `actions/checkout` 4 to 7.0.1, `actions/setup-node` 4 to 7.1.0 | Accepted and pinned by SHA: official org, months old, release notes show security hardening and an ESM/`NODE_AUTH_TOKEN` change that does not affect this workflow |
| 2026-11-01 | `typescript` 6.0.3 to 7.0.2                                    | Rejected: `typescript-eslint` declares support for `<6.1.0`, so `npm ci` fails. Major updates for `typescript` are ignored in Dependabot until that changes        |
