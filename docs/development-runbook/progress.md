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

## 1.1 Start isolated PostgreSQL

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: none
- Commands: Docker Desktop start/status, `npm run db:up`, `wsl --status`, native PostgreSQL discovery, PostgreSQL 16 `winget` install attempts, PostgreSQL 9.5 read-only version/auth probe.
- Test result: native PostgreSQL 16.14 is installed as `postgresql-x64-16`, runs independently from the legacy 9.5 service, and accepts authenticated connections on `localhost:15433`.
- Evidence: `select version()` returned PostgreSQL 16.14; the service is automatic and runs under NetworkService. The superuser password was rotated and exists only in ignored local environment files.
- Blocker: none. Docker remains unavailable without WSL 2 but is no longer required for local database development.
- Next: keep the legacy PostgreSQL 9.5 service out of RightNow configuration.

## 2.2 Implement and apply Memory Schema

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/prisma/schema.prisma`
- Commands: `prisma format`, `prisma validate`, `prisma generate`, backend build.
- Test result: schema formatting/validation, Prisma Client generation, database push, seed, and NestJS compilation pass.
- Evidence: `AgentMemoryFact` and `AgentMemoryProfile` exist alongside `User` and `ChatMessage`. This was a new empty RightNow database, so no pre-change dump or legacy rows existed.
- Blocker: none
- Next: add database-backed Memory integration cases when extending the module.

## 1.2 Generate and validate Prisma Schema

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: ignored local database and environment files only
- Commands: `prisma generate`, `prisma db push`, seed, `prisma validate`, PostgreSQL catalog queries.
- Test result: all commands passed; demo, buddy, and admin seed users were created.
- Evidence: core and Memory tables are present in PostgreSQL 16 on port 15433.
- Blocker: none
- Next: verify protected HTTP APIs.

## 1.3 Verify authentication and business API baseline

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: none
- Commands: start built NestJS app; register/login/history HTTP smoke requests.
- Test result: unauthenticated chat history returns 401; registration succeeds; login returns JWT; authenticated history returns 200.
- Evidence: backend started successfully on `127.0.0.1:5000` and served database-backed requests.
- Blocker: none
- Next: retain generated test users as disposable local-only data.

## 1.4 Verify intent classification baseline

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: none
- Commands: `npm --workspace backend run test:intent`
- Test result: 32 cases and 224/224 field checks passed.
- Evidence: coverage includes logging, advice, high risk, mixed intent, and `out_of_domain`.
- Blocker: none
- Next: rerun after classifier changes.

## 1.5 Verify Agent RPC authentication and audit

- Owner: ROOT
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/prisma/schema.prisma`, `backend/src/agent/agent-audit.service.ts`, `backend/src/agent/agent-rpc.service.ts`
- Commands: three authenticated HTTP variants, `memory.context.assemble`, direct audit verification.
- Test result: missing/wrong tokens return 401; correct token succeeds; audit stores userId, tool, status, duration, and sanitized argument digest.
- Evidence: smoke audit recorded `memory.context.assemble`, success, 269ms, and `{}` without any token or private Memory content.
- Blocker: none
- Next: add an automated HTTP integration suite around these assertions.

## 2.1 Design Memory Schema

- Owner: AGENT-BE (proposal), ROOT (review)
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/prisma/schema.prisma`, `docs/development-runbook/architecture.md`
- Commands: schema review against authority, lifecycle, risk, isolation, and deletion requirements.
- Test result: one-per-user profile, indexed facts, lifecycle enums, cascade deletion, and service-enforced confidence/risk constraints are represented.
- Evidence: `AgentMemoryProfile`, `AgentMemoryFact`, and three Memory enums added to the schema.
- Blocker: none for design; database application remains blocked by step 1.1.
- Next: format, validate, generate, and build without applying to PostgreSQL.

## 2.3 Create agent-memory module skeleton

- Owner: AGENT-BE
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/src/agent-memory/agent-memory.module.ts`, `backend/src/agent-memory/memory-sync.service.ts`, DTO and service files in the same directory
- Commands: `npm --workspace backend run test:agent-memory`, `npm run build:backend`
- Test result: NestJS TypeScript build passed with all Memory providers and exports; no circular dependency exists inside the module.
- Evidence: ROOT imported `AgentMemoryModule` in `AppModule`; the formal Memory test script and repository backend build both exit successfully.
- Blocker: application startup against PostgreSQL remains unavailable while step 1.1 is blocked by WSL/Docker.
- Next: run backend startup smoke test after PostgreSQL becomes available.

## 2.4 Implement candidate memory creation

- Owner: AGENT-BE
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/src/agent-memory/memory-candidate.service.ts`, `backend/src/agent-memory/agent-memory.service.ts`, `backend/scripts/test-agent-memory.cjs`
- Commands: `cd backend`, `npm run build`, `node scripts/test-agent-memory.cjs`
- Test result: direct response-style preference creates a candidate; current weight, one meal, and one workout are excluded; possible knee injury remains a risk-sensitive candidate.
- Evidence: all four required table-driven cases pass, and candidate persistence validates confidence in `0..1`.
- Blocker: none
- Next: integrate extraction invocation only after the chat orchestration contract is assigned.

## 2.5 Implement confirmation, rejection, and expiration

- Owner: AGENT-BE
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/src/agent-memory/agent-memory.service.ts`, `backend/src/agent-memory/dto/memory.dto.ts`, `backend/scripts/test-agent-memory.cjs`
- Commands: `cd backend`, `npm run build`, `node scripts/test-agent-memory.cjs`
- Test result: cross-user fact access fails; risk confirmation without explicit user evidence fails; valid risk confirmation succeeds; illegal confirmed-to-rejected reversal fails.
- Evidence: state transitions query by both `id` and `userId`; invalidation timestamps and confirmation evidence are persisted.
- Blocker: database-backed integration test awaits Docker/PostgreSQL availability.
- Next: rerun the same cases against PostgreSQL after step 1.1 is unblocked.

## 2.6 Implement conflict and correction

- Owner: AGENT-BE
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/src/agent-memory/memory-conflict.service.ts`, `backend/scripts/test-agent-memory.cjs`
- Commands: `cd backend`, `npm run build`, `node scripts/test-agent-memory.cjs`
- Test result: correcting user A's exercise preference leaves exactly one active value, links the old fact to its replacement, and does not modify user B's matching fact.
- Evidence: replacement creation and same-user/category supersession execute in one Prisma transaction.
- Blocker: database-backed concurrency test awaits Docker/PostgreSQL availability.
- Next: add a real transaction/concurrency integration case when the database is running.

## 2.7 Implement Profile aggregation

- Owner: AGENT-BE
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `backend/src/agent-memory/memory-profile.service.ts`, `backend/scripts/test-agent-memory.cjs`
- Commands: `cd backend`, `npm run build`, `node scripts/test-agent-memory.cjs`, `npx prisma validate`
- Test result: only confirmed facts enter Profile; confirming a candidate increments the version; expiring a fact removes it and increments again; identical synchronization keeps the version unchanged.
- Evidence: deterministic ordering and byte-equivalent JSON comparison make repeated synchronization read-only and idempotent; Prisma validation passed.
- Blocker: database-backed projection test awaits Docker/PostgreSQL availability.
- Next: Wave 3 adds stable `MEMORY.md` serialization behind `MemorySyncService`.

## 4.1 Read-only cloud audit

- Owner: AGENT-OC
- Status: blocked
- Started/completed: 2026-07-11
- Changed files: none
- Commands: `ssh -o BatchMode=yes -o ConnectTimeout=8 root@106.54.16.31 "openclaw --version; openclaw gateway status; ..."`
- Test result: authentication failed before any remote command ran; no remote state was changed and no token was displayed.
- Evidence: SSH returned `Permission denied (publickey,gssapi-keyex,gssapi-with-mic,password)`.
- Blocker: a usable SSH private key or installation of this workstation's public key on the server is required.
- Next: repeat the read-only audit and record sanitized OpenClaw version, Gateway state, config shape, plugin path, and Personal workspace path.

## 4.2 Establish Provisioner skeleton

- Owner: AGENT-OC
- Status: completed (local)
- Started/completed: 2026-07-11
- Changed files: `infra/provisioner/package.json`, `README.md`, `src/config.js`, `src/server.js`, `src/index.js`
- Commands: `cd infra/provisioner`, `npm test`
- Test result: missing configuration and wildcard bind fail closed; no/wrong Bearer token returns 401; valid request succeeds.
- Evidence: provisioner suite passed 6/6 on Node 24, compatible with the declared Node >=22 engine.
- Blocker: actual Tailscale address and cloud deployment remain unavailable until SSH access is restored.
- Next: deploy with the server's specific Tailscale IP, never a wildcard or public bind.

## 4.3 Validate Agent ID

- Owner: AGENT-OC
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `infra/provisioner/src/agent-id.js`, `infra/provisioner/test/provisioner.test.js`
- Commands: `npm test`
- Test result: traversal, Personal ID, empty ID, and overlong ID fail; `rightnow-user_123` passes; caller-supplied workspace returns 400.
- Evidence: workspace is derived exclusively as `<workspaceRoot>/workspace-<agentId>` after strict `rightnow-*` validation.
- Blocker: none
- Next: retain this validator as the only provision API entry path.

## 4.4 Implement atomic config update

- Owner: AGENT-OC
- Status: completed (local)
- Started/completed: 2026-07-11
- Changed files: `infra/provisioner/src/config-store.js`, `infra/provisioner/test/provisioner.test.js`
- Commands: `npm test`
- Test result: duplicate provision is idempotent; simulated pre-rename failure preserves the original; concurrent agents are both retained.
- Evidence: exclusive lock file, JSON validation, backup, same-directory temporary write, file fsync, atomic rename, and best-effort directory fsync are implemented.
- Blocker: Gateway hot-load behavior requires the cloud audit/deployment.
- Next: verify the live Gateway observes the new agent or add an authenticated reload hook if its installed version requires one.

## 4.5 Create workspace templates

- Owner: AGENT-OC
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `infra/provisioner/src/workspace.js`, `infra/provisioner/test/provisioner.test.js`
- Commands: `npm test`
- Test result: `AGENTS.md`, `USER.md`, `MEMORY.md`, `.gitignore`, and `memory/` are created; initial Memory contains only `No durable preferences confirmed yet.`.
- Evidence: templates contain no token, current business fact, plan body, or Personal workspace path; USER contains only userId and language.
- Blocker: none
- Next: cloud smoke-test resulting ownership and mode under the actual OpenClaw account.

## 4.6 Implement workspace bootstrap

- Owner: AGENT-OC
- Status: completed (local)
- Started/completed: 2026-07-11
- Changed files: `infra/provisioner/src/workspace.js`, `infra/provisioner/test/provisioner.test.js`
- Commands: `npm test`
- Test result: first bootstrap is complete, second bootstrap preserves edited Memory, invalid paths fail, and a Personal workspace sentinel is byte-identical afterward.
- Evidence: files use exclusive create; target realpath must remain below the configured root.
- Blocker: live Personal workspace hash/mtime comparison requires SSH access.
- Next: repeat isolation checks against a disposable RightNow user on cloud.

## 4.7 Connect NestJS admin-http

- Owner: AGENT-OC (contract), ROOT (backend)
- Status: completed (contract only)
- Started/completed: 2026-07-11
- Changed files: `infra/provisioner/README.md`, `infra/provisioner/src/server.js`
- Commands: local HTTP tests via `npm test`
- Test result: contract is `POST /provision`, Bearer auth, body `{agentId, language?}`; arbitrary workspace is rejected and errors never echo tokens.
- Evidence: valid/unauthorized/invalid HTTP cases pass in the provisioner suite.
- Blocker: ROOT must verify backend success, 401, 500, timeout, and Gateway hot-load timeout behavior end to end.
- Next: configure `OPENCLAW_PROVISION_MODE=admin-http`, URL, and distinct admin token after cloud deployment.

## 4.8 Validate Plugin contract

- Owner: AGENT-OC
- Status: completed locally; cloud load check blocked
- Started/completed: 2026-07-11
- Changed files: `openclaw/extensions/rightnow/package.json`
- Commands: manifest parse, contract membership check, `node --check index.js`, `node --check src/rightnow-tools.js`, `node --check src/identity.js`
- Test result: manifest parses, declares `rightnow_classify_intent`, and all runtime JS syntax checks pass.
- Evidence: PowerShell contract lookup returned `True`.
- Blocker: Gateway loaded/no-legacy-path log evidence requires SSH access.
- Next: inspect sanitized Gateway logs after deployment.

## 4.9 Validate Plugin identity mapping

- Owner: AGENT-OC
- Status: completed (local)
- Started/completed: 2026-07-11
- Changed files: `openclaw/extensions/rightnow/src/identity.js`, `identity.ts`, `rightnow-tools.js`, `test/identity.test.js`
- Commands: `cd openclaw/extensions/rightnow`, `npm test`
- Test result: 5/5 pass for canonical session, canonical agent, forged model identity removal, empty/Personal rejection, and session-agent mismatch rejection.
- Evidence: web RPC identity is accepted only from RightNow session/agent context; model arguments cannot set user, session, agent, channel-user, or workspace identity.
- Blocker: live write-tool denial should be repeated through Gateway once cloud access is available.
- Next: run the five cases against a deployed plugin and correlate backend audit userId.

## 4.10 Configure Memory embedding

- Owner: AGENT-OC
- Status: blocked
- Started/completed: 2026-07-11
- Changed files: none
- Commands: not run because SSH authentication fails.
- Test result: no provider capability is assumed and no false recall result was recorded.
- Evidence: cloud commands `openclaw memory status/index/search` require restored SSH access.
- Blocker: SSH authentication and a confirmed embedding-capable provider configuration.
- Next: verify provider support, then run status, forced index, and sourced search without exposing credentials.

## 3.1 Create Python 3.11 virtual environment

- Owner: AGENT-RAG
- Status: blocked
- Started/completed: 2026-07-11
- Changed files: `rag-service/requirements.txt`
- Commands: `py -V:Astral/CPython3.11.15 -m venv .venv`, `.venv/Scripts/python -m pip install --upgrade pip`, `.venv/Scripts/python -m pip install -r rag-service/requirements.txt`, Python/import checks.
- Test result: Python 3.11.15 and pip 26.1.2 are present; removed an invalid leading `"""` requirement. Full dependency installation exceeded the 120-second command limit and `import fastapi, chromadb` still fails.
- Evidence: virtual environment is ignored; import exits with `ModuleNotFoundError: fastapi`.
- Blocker: finish dependency installation in a longer-lived shell before ingestion/API tests.
- Next: rerun pip install, then require the documented `ok` import result.

## 3.2 Check knowledge-source structure

- Owner: AGENT-RAG
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `rag-service/scripts/structure_check.py`
- Commands: `python rag-service/scripts/structure_check.py --help`, `python rag-service/scripts/structure_check.py`.
- Test result: passed; L1 has 30 valid FAQ entries with unique IDs, L2 has 11 non-empty Markdown files, and L3 has 8 non-empty Markdown files.
- Evidence: script prints `structure check passed` and exits 0.
- Blocker: none
- Next: keep this read-only validation before every import.

## 3.3 Clean and deduplicate

- Owner: AGENT-RAG
- Status: completed
- Started/completed: 2026-07-11
- Changed files: `rag-service/scripts/prepare_sources.py`, `.gitignore`
- Commands: `python rag-service/scripts/prepare_sources.py --source l2-core --source l3-books --output rag-service/.work/prepared`, file/empty counts, `git check-ignore rag-service/.work/prepared`.
- Test result: 19 output files, 0 empty files, 0 exact duplicate documents; source directories were not modified.
- Evidence: output is isolated below ignored `rag-service/.work/`; Chroma runtime directories are also ignored.
- Blocker: none
- Next: import original validated sources or prepared copies into the ignored persistent directory.

## 3.4 Import L1/L2/L3

- Owner: AGENT-RAG
- Status: blocked
- Started/completed: 2026-07-11
- Changed files: `rag-service/scripts/ingest_all.py`, `.gitignore`
- Commands: `python rag-service/scripts/ingest_all.py --help`.
- Test result: three-layer CLI and explicit persistent directory parameters validate successfully; actual import/count/restart checks were not run because Step 3.1 dependencies are unavailable.
- Evidence: help exposes `--l1`, `--l2`, `--l3`, `--persist-dir`, and `--force`; output defaults below ignored `rag-service/.work/chroma`.
- Blocker: incomplete Python dependencies and embedding model availability.
- Next: run forced import, record all three counts, reopen stores in a second process, and compare counts.

## 3.5 Run retrieval acceptance set

- Owner: AGENT-RAG
- Status: pending
- Started/completed: 2026-07-11
- Changed files: none
- Commands: not run.
- Test result: pending successful Step 3.4 ingestion.
- Evidence: none yet.
- Blocker: Step 3.4.
- Next: test plateau, beginner frequency, strength/cardio, back injury recovery, and severe sleep deprivation with source metadata assertions.

## 3.6 Validate RAG API

- Owner: AGENT-RAG
- Status: pending
- Started/completed: 2026-07-11
- Changed files: `rag-service/main.py`
- Commands: source review only.
- Test result: request schema now trims query, rejects blank query, and bounds `top_k` to 1..20; HTTP behavior remains unverified until dependencies and collections are ready.
- Evidence: Pydantic validation is defined on `SearchRequest`; FastAPI should return 422 for blank query.
- Blocker: Steps 3.1 and 3.4.
- Next: start API and test docs, FAQ/Core/Books queries, and blank-query 422.
