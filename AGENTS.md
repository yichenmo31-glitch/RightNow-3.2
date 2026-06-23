# RightNow Public Agent Notes

This repository is safe for public collaboration. It intentionally does not
include production server addresses, passwords, API keys, certificates, database
dumps, user uploads, or private operational handoff notes.

## Collaboration Rules

1. Treat production credentials, API keys, tokens, SSH details, cookies, and
   private user data as secrets. Never commit them.
2. Use `.env` files for local and production secrets. Keep `.env` files out of
   Git and update `.env.example` only with placeholders.
3. Keep deployment artifacts, backups, certificates, logs, generated archives,
   uploaded files, and vector database files out of the repository.
4. Before opening a pull request, run a sensitive-data scan for server IPs,
   passwords, tokens, and provider keys.
5. Prefer backend-side integrations for paid AI providers. Do not bake API keys
   into browser bundles.

## Project Overview

RightNow is an AI fitness and body-transformation platform built as a monorepo:

- `frontend/`: React, Vite, TypeScript, Three.js, Tailwind CSS.
- `backend/`: NestJS, Prisma, PostgreSQL, JWT authentication, AI coach APIs.
- `rag-service/`: FastAPI, LangChain, Chroma, fitness knowledge retrieval.
- `docker-compose.prod.yml`: production-style service topology with secret
  values injected through private environment variables.

## Public Deployment Notes

The compose file is a template. Provide private values through a non-committed
`.env` file:

- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ADMIN_SEED_PASSWORD`
- `STEPFUN_API_KEY`
- `IMAGE_GEN_API_KEY`
- `CORS_ORIGIN`

Do not commit real production values. If a secret is accidentally committed,
rotate it immediately and remove it from the latest repository state.
