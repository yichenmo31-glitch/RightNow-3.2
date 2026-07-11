# RightNow Architecture Decisions

## Cross-Service Identity Contract

- Normalized user ID: trim surrounding whitespace and lowercase the application user ID.
- OpenClaw Agent ID: `rightnow-<normalizedUserId>`.
- OpenClaw Session Key: `rightnow:<normalizedUserId>`.
- Cloud workspace: `/root/.openclaw/workspace-rightnow-<normalizedUserId>`.
- Prefix conversion is idempotent. The backend computes these identifiers; model-supplied identity fields are never authoritative.

## Data Authority and Conflict Resolution

The authoritative order is:

1. Current explicit user statement.
2. Latest confirmed PostgreSQL business fact.
3. PostgreSQL `AgentMemoryProfile`.
4. OpenClaw `MEMORY.md`.
5. Dated observations in `memory/YYYY-MM-DD.md`.
6. Agent inference.

PostgreSQL owns current weight, meals, workouts, TODOs, plans, confirmed memory facts, and recoverable profiles. `MEMORY.md` contains only stable, confirmed preferences and must never replace current database facts. RAG supplies reference knowledge, not user facts. Session history supplies conversational continuity, not durable truth.

## Security and Isolation Boundaries

- Personal OpenClaw workspace `/root/.openclaw/workspace` is outside RightNow ownership.
- Each RightNow user has a distinct Agent, Session namespace, workspace, database scope, and audit scope.
- Browser clients never receive gateway, provisioner, internal API, or agent-service tokens.
- Cloud-to-local HTTP requires both Tailscale network restriction and Bearer authentication.
- High-risk facts require explicit confirmation before durable promotion.
- `out_of_domain` requests cannot invoke RightNow database, memory, RAG, or write tools.

## Memory Persistence Contract

- `AgentMemoryFact` is the lifecycle record for a candidate or confirmed durable fact. Status is one of candidate, confirmed, rejected, expired, or superseded.
- `AgentMemoryProfile` is a one-per-user, versioned projection built only from confirmed facts.
- Confidence is validated in the service as `0..1`; Prisma has no portable check constraint for this field.
- Health risks, allergies, and execution authorization require an explicit confirmation source before confirmation.
- Both models cascade on user deletion. Queries and transitions must always scope fact IDs by `userId`.
- Fact lifecycle is forward-only: candidate may become confirmed, rejected, or expired; confirmed may become expired or superseded. Rejected, expired, and superseded facts cannot become active again.
- Explicit correction creates the replacement and supersedes active facts of the same user and category in one transaction. Each old fact records the replacement in `supersededById`.
- Profile synchronization sorts confirmed facts deterministically. It increments `memoryVersion` and updates `lastSyncedAt` only when projected content changes; identical synchronization is read-only and idempotent.

## Local Ports

- React/Vite: `5173` by default.
- NestJS API: `5000`.
- RAG API: `8000`.
- PostgreSQL 16 or newer may run in Docker or as a native Windows instance. RightNow's local connection contract is `localhost:15433`; the runtime mechanism is not an application dependency.
- Docker maps host `15433` to container `5432`. A native instance listens directly on `15433`. Local backend `DATABASE_URL` remains unchanged between the two options.
- OpenClaw Gateway: `18789` unless deployment configuration overrides it.
- OpenClaw Provisioner: `8787` by default, bound only to the cloud host's explicit Tailscale IP.

## OpenClaw Provisioning Contract

- The internal endpoint is `POST /provision` with Bearer authentication and body `{ agentId, language? }`; callers cannot supply a workspace path.
- Agent IDs must match `^rightnow-[a-z0-9][a-z0-9_-]*$` and are limited to 128 characters.
- The workspace is server-computed below `OPENCLAW_WORKSPACE_ROOT` as `workspace-<agentId>`, yielding `/root/.openclaw/workspace-rightnow-<normalizedUserId>` in production.
- Provisioning is serialized with an exclusive lock, validates existing JSON, writes a backup and fsynced same-directory temporary file, then atomically renames it.
- Workspace bootstrap uses exclusive file creation and never overwrites existing user files. Resolved paths must remain under the configured root; Personal workspace is never read or written.
- Web plugin calls derive database identity only from a canonical RightNow Session or Agent. A mismatched pair fails closed, and model arguments cannot override identity.

## Key File Responsibilities

- `AGENTS.md`: repository-wide contributor rules and mandatory reading order.
- `docs/development-runbook/RIGHTNOW_DEVELOPMENT_STEP_BY_STEP.md`: ordered implementation work, ownership, tests, and gates.
- `docs/development-runbook/progress.md`: execution evidence, current status, blockers, and handoff notes.
- `docs/development-runbook/architecture.md`: confirmed cross-module decisions and file responsibility map; excludes temporary debugging notes.
- `backend/src/openclaw/openclaw.client.ts`: sole backend gateway client and canonical Agent/Session ID conversion.
- `backend/scripts/test-openclaw-identity.cjs`: executable regression test for identity normalization and prefix idempotence.
- `backend/prisma/schema.prisma`: authoritative relational schema, including business facts, audit records, and durable Memory lifecycle records.
- `backend/src/agent-memory/agent-memory.module.ts`: Memory provider/export boundary; `AppModule` owns application-level wiring.
- `backend/src/agent-memory/dto/memory.dto.ts`: lifecycle/category/source vocabulary and service input contracts matching Prisma enum values.
- `backend/src/agent-memory/memory-candidate.service.ts`: deterministic first-stage candidate filtering; excludes transient weight, meal, and workout facts and never confirms candidates.
- `backend/src/agent-memory/agent-memory.service.ts`: candidate persistence and user-scoped confirmation, rejection, and expiration state transitions.
- `backend/src/agent-memory/memory-conflict.service.ts`: transactional replacement of contradictory confirmed facts.
- `backend/src/agent-memory/memory-profile.service.ts`: confirmed-only, versioned, idempotent PostgreSQL profile projection.
- `backend/src/agent-memory/memory-sync.service.ts`: reserved boundary for Wave 3 `MEMORY.md` serialization and remote synchronization; it has no transport behavior in Wave 1.
- `backend/scripts/test-agent-memory.cjs`: executable regression suite using an in-memory Prisma-compatible test double for candidate, lifecycle, isolation, conflict, and profile rules.
- `infra/provisioner/src/config.js`: startup configuration validation; rejects missing secrets/paths and wildcard network binds.
- `infra/provisioner/src/agent-id.js`: sole provisioner Agent ID grammar and length validator.
- `infra/provisioner/src/config-store.js`: locked, backed-up, atomic updater for `openclaw.json` `agents.list`.
- `infra/provisioner/src/workspace.js`: isolated workspace path derivation, templates, and non-destructive bootstrap.
- `infra/provisioner/src/server.js`: authenticated internal `POST /provision` HTTP contract and sanitized error boundary.
- `infra/provisioner/src/index.js`: process entrypoint that binds the validated address and port.
- `infra/provisioner/test/provisioner.test.js`: local security, idempotence, atomicity, concurrency, isolation, and HTTP regression suite.
- `openclaw/extensions/rightnow/openclaw.plugin.json`: plugin manifest and declared runtime tool contract.
- `openclaw/extensions/rightnow/src/identity.js`: runtime extraction of canonical RightNow session/agent identity and removal of model-controlled identity fields.
- `openclaw/extensions/rightnow/src/identity.ts`: typed source mirror of the runtime identity contract.
- `openclaw/extensions/rightnow/src/rightnow-tools.js`: runtime tool registrations and authenticated backend RPC adapter; web calls use the identity module before RPC.
- `openclaw/extensions/rightnow/test/identity.test.js`: regression cases for session, agent, forged, empty, Personal, and mismatched identities.
- `.env` and `backend/.env`: ignored local configuration and secrets; never committed.
- `l1-faq/faq.json`: authoritative structured FAQ source; each entry requires a unique ID, question, and answer.
- `l2-core/`: authoritative concise core-guidance Markdown source; ingestion records the source filename.
- `l3-books/`: authoritative deeper reference and safety/recovery Markdown source; it remains separate from L2 for explicit risk routing.
- `rag-service/scripts/structure_check.py`: read-only L1/L2/L3 schema, uniqueness, presence, and non-empty validation.
- `rag-service/scripts/prepare_sources.py`: optional non-destructive normalization and whole-document exact deduplication into a caller-selected disposable output directory.
- `rag-service/scripts/ingest_all.py`: canonical local three-layer importer; maps L1/L2/L3 to distinct Chroma collections and accepts an explicit persistence root.
- `rag-service/main.py`: FastAPI RAG boundary for layer-specific and combined retrieval; request validation rejects blank queries before retrieval.
- `rag-service/.work/` and `rag-service/chroma_*/`: ignored local preparation and Chroma persistence state; they are rebuildable runtime data, never knowledge-source authority.
