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
- GitHub Actions are pinned to a major version; review each upgrade.

## Current state (2026-11-01)

- No high or critical advisories.
- All installed packages have verified registry signatures.
- The only package with an install script is `fsevents`, an optional macOS file watcher, which does not run on Windows or Linux.
- Direct dev dependencies were installed with a cutoff of 2026-10-17 (a 14-day cooldown).
- Open moderate findings: see [known-issues.md](known-issues.md).
