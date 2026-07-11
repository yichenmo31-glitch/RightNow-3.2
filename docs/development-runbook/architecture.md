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

## Key File Responsibilities

- `AGENTS.md`: repository-wide contributor rules and mandatory reading order.
- `docs/development-runbook/RIGHTNOW_DEVELOPMENT_STEP_BY_STEP.md`: ordered implementation work, ownership, tests, and gates.
- `docs/development-runbook/progress.md`: execution evidence, current status, blockers, and handoff notes.
- `docs/development-runbook/architecture.md`: confirmed cross-module decisions and file responsibility map; excludes temporary debugging notes.
- `backend/src/openclaw/openclaw.client.ts`: sole backend gateway client and canonical Agent/Session ID conversion.
- `backend/scripts/test-openclaw-identity.cjs`: executable regression test for identity normalization and prefix idempotence.
- `.env` and `backend/.env`: ignored local configuration and secrets; never committed.
