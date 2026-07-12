# Repository Guidelines

> 重要提示：写任何代码前必须阅读 `docs/development-runbook/architecture.md` 和 `docs/development-runbook/RIGHTNOW_DEVELOPMENT_STEP_BY_STEP.md`。

## Project Structure & Module Organization

This is a multi-service fitness platform. `frontend/` contains the React 19/Vite application, views, API clients, public assets, and frontend scripts. Read `frontend/AGENTS.md` and `frontend/CLAUDE_PROJECT_MEMORY.md` before substantial UI work. `backend/` is the NestJS API; Prisma schema and seed data live in `backend/prisma/`, while feature modules live under `backend/src/`. `rag-service/` owns FastAPI/Chroma retrieval, its documentation, and the authoritative L1/L2/L3 knowledge sources under `rag-service/knowledge/`. The OpenClaw plugin is in `openclaw/extensions/rightnow/`; cross-service integration and operating notes belong in `docs/`.

## Build, Test, and Development Commands

- `npm install`: install all workspace dependencies and generate Prisma Client.
- `npm run db:up` / `npm run db:init`: start PostgreSQL, push the schema, and seed data.
- `npm run dev:backend`: run NestJS in watch mode on the configured API port.
- `npm run dev:frontend`: run Vite locally.
- `npm run dev:rag`: start the FastAPI RAG service on port 8000.
- `npm run build:backend` and `npm run build:frontend`: run production builds.
- `cd backend && npm run test:intent`: build the backend and run classifier cases.
- `cd backend && npx prisma validate`: validate schema changes.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, single quotes in backend code, and existing NestJS module/service/controller patterns. Use `PascalCase` for React components and classes, `camelCase` for functions, and kebab-case for feature directories. Python uses four spaces and snake_case. Keep TypeScript and runtime JavaScript plugin files synchronized when both exist. No repository-wide formatter is configured; preserve nearby style and run `git diff --check`.

## Testing Guidelines

Add focused tests for changed behavior. Extend `docs/AGENT_INTENT_CLASSIFIER_TESTS.csv` for classifier rules. RAG changes require structure, ingestion, persistence, and representative retrieval smoke tests. OpenClaw changes require manifest parsing, `node --check`, identity-isolation cases, and authenticated API checks. Never mark work complete with failing or skipped validation.

## Commit & Pull Request Guidelines

Follow the established Conventional Commit style, for example `feat(intent): ...`, `fix(openclaw): ...`, and `docs(dev): ...`. Keep commits independently testable and free of generated secrets or data. Pull requests should describe behavior and configuration changes, list validation commands and results, link the relevant issue, and include screenshots for visible UI changes.

## Security & Configuration

Never commit `.env`, tokens, database dumps, Chroma indexes, user workspaces, or real user data. PostgreSQL is authoritative for business facts; OpenClaw memory must not override current database values. Preserve `rightnow-<userId>` Agent and `rightnow:<userId>` Session isolation.
