# RightNow Project Memory

This is a sanitized public project-memory file for coding agents and human
contributors. It records architecture and workflow preferences only. Private
server credentials, API keys, user data, production logs, and deployment
handoff details must stay outside the repository.

## Architecture

- Monorepo managed with npm workspaces.
- `frontend/`: React, Vite, TypeScript, Tailwind CSS, Three.js, Recharts.
- `backend/`: NestJS, Prisma, PostgreSQL, JWT auth, upload handling, AI coach,
  diet, evolution, and user profile modules.
- `rag-service/`: FastAPI service for retrieval-augmented fitness knowledge.
- Production-style deployment uses Docker Compose with secrets provided through
  private environment variables.

## Working Preferences

- Keep user-facing changes consistent with the existing product experience.
- Keep AI provider keys on the backend whenever possible.
- Update frontend and backend shared types together when changing API payloads.
- Do not commit `.env`, certificates, backups, generated archives, uploads,
  database files, vector indexes, or private handoff notes.
- Run a sensitive-data scan before publishing changes.

## Useful Commands

```bash
npm install
npm run build:backend
npm run build:frontend
npm run db:push
```

For local secrets, copy the relevant example file and fill in private values
outside Git.
