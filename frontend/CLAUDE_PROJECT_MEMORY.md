# Frontend Project Memory

This sanitized public memory file summarizes frontend conventions only. It must not contain production hosts, demo passwords, private account details, API keys, user data, or deployment credentials.

## Stack

- React + Vite + TypeScript
- Tailwind CSS for styling
- Three.js / React Three Fiber for body and evolution visuals
- Recharts for dashboard charts
- Axios API client through `/api`

## Product Areas

- Auth and onboarding
- AI Coach intake and first-day plan flow
- Dashboard and evolution progress
- Diet logging and training records
- Community and friendship surfaces
- Ideal-body and user image persistence

## Frontend Rules

- Keep paid AI provider keys out of browser bundles whenever possible.
- Use backend APIs for authenticated, private, or paid provider calls.
- Keep local demo credentials in private environment variables.
- Do not commit screenshots, user uploads, logs, or private test data.
- Restart the Vite dev server after changing proxy routes or environment variables.

## Useful Local Commands

```bash
npm run dev:frontend
npm run build:frontend
```
