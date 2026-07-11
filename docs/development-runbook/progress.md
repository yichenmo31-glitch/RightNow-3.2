# RightNow Development Progress

## 0.1 Confirm clean baseline

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: none
- Commands: `git status --short --branch`, `git remote -v`, `git fsck --full --no-dangling`, `git log -5 --oneline`
- Test result: branch is `local-integration`; remote is `yichenmo31-glitch/RightNow-3.2`; full fsck passed.
- Evidence: the only initial uncommitted file was the requested root `AGENTS.md`.
- Blocker: none
- Next: verify toolchain.

## 0.2 Confirm tool versions

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: none
- Commands: `git --version`, `node --version`, `npm --version`, Docker CLI/Compose version checks, `py -0p`
- Test result: Git 2.52.0, Node 24.13.0, npm 11.6.2, Docker 29.6.1, Compose 5.2.0, Python 3.11.15 available.
- Evidence: Docker CLI works at `C:\Program Files\Docker\Docker\resources\bin\docker.exe`.
- Blocker: Docker CLI directory is absent from the current shell PATH; use the absolute path or refresh PATH until corrected.
- Next: create ignored local configuration.

## 0.3 Establish local secret files

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `.env`, `backend/.env` (ignored, never committed)
- Commands: copy templates, generate independent random values, `git check-ignore .env backend/.env`, `git status --short`
- Test result: both files are ignored; five independently generated 256-bit values are unique and at least 64 hexadecimal characters long.
- Evidence: `git check-ignore` returned `.env` and `backend/.env`; neither appears in `git status`.
- Blocker: none
- Next: generate files without exposing values.

## 0.4 Freeze cross-service identity contract

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `architecture.md`, `backend/package.json`, `backend/scripts/test-openclaw-identity.cjs`
- Commands: `npm run test:openclaw-identity`
- Test result: backend build passed; 6 identity assertions passed for normalization, casing, whitespace, existing prefixes, and repeated conversion.
- Evidence: `npm run test:openclaw-identity` completed successfully and the canonical example resolves to `rightnow-user-1 rightnow:user-1`.
- Blocker: none
- Next: build and run identity tests.

## 0.5 Freeze data authority and conflict priority

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `docs/development-runbook/architecture.md`
- Commands: architecture review against the two runbooks.
- Test result: authority order, memory exclusions, isolation, risk, and out-of-domain boundaries are explicitly documented.
- Evidence: `Data Authority and Conflict Resolution` and `Security and Isolation Boundaries` sections.
- Blocker: none
- Next: finish Wave 0 validation, then begin Wave 1.
