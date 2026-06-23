# RightNow Frontend Local Startup

This document is safe for the public repository. It contains local development guidance only and does not include production hosts, passwords, or private account details.

## Manual Startup

Run from the repository root:

```powershell
npm install
npm run db:up
npm run db:push
npm run dev:backend
$env:VITE_API_BASE_URL='http://localhost:5000/api'
npm run dev:frontend
```

## Local URLs

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000`

## Demo Data

If you need seeded demo users, configure these values in your private local environment before running the seed command:

- `DEMO_SEED_EMAIL`
- `DEMO_SEED_PASSWORD`
- `BUDDY_SEED_EMAIL`
- `BUDDY_SEED_PASSWORD`
- `ADMIN_SEED_EMAIL`
- `ADMIN_SEED_PASSWORD`

Do not commit real demo passwords or production account details.

## Troubleshooting

- If `POST /api/training-sessions` returns `404`, restart both frontend and backend dev services.
- If you change `frontend/vite.config.ts`, restart `npm run dev:frontend`.
- If Prisma schema changes, run `npm run db:push` before testing backend flows.
