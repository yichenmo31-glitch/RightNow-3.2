# RightNow Project Report

This public report summarizes product direction and implementation status without exposing private deployment data, demo passwords, API keys, or user information.

## Product Goal

RightNow helps users move from intention to visible fitness progress through AI coaching, training plans, diet logging, progress tracking, and ideal-body visualization.

## Core Modules

1. AI Coach onboarding, assessment, first-day plan, follow-up prompts, and progress profile.
2. Evolution engine for current state, ideal-body references, stage planning, and visual progress.
3. Diet logging with image-assisted analysis and structured nutrition records.
4. Training records, TODOs, check-ins, and dashboard insights.
5. RAG-backed fitness knowledge service for coach context and retrieval.
6. Social and friendship modules for future accountability loops.

## Current Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, Three.js, Recharts.
- Backend: NestJS, Prisma, PostgreSQL, JWT authentication.
- RAG: FastAPI, LangChain, Chroma, Chinese embedding model.
- Deployment: Docker Compose and Nginx templates with private environment variables.

## Security Requirements

- Keep `.env`, API keys, server addresses, production logs, certificates, backups, uploads, and user data out of Git.
- Configure demo and admin seed passwords through private environment variables.
- Prefer backend-side AI provider integrations instead of browser-bundled secrets.

## Recommended Verification

```bash
npm run build:backend
npm run build:frontend
```

For database changes, also run Prisma generation or schema sync according to the deployment environment.
