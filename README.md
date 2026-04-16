# Oil Shock

Oil Shock is a low-cost energy dislocation state engine. It monitors whether
physical energy constraints are worsening faster than markets are recognizing,
then publishes a snapshot state with supporting evidence and coverage/freshness
signals.

## Current Delivery Status

This repository currently includes:

- Live Cloudflare Worker deployments (preview and production)
- Live Cloudflare D1 database with schema applied
- Live Vercel frontend deployments (preview and production alias)
- Operational CI on GitHub Actions
- Functional UI screens for:
  - State summary
  - Evidence table
  - Ledger review queue

## Live Endpoints

- Frontend (production): `https://oil-shock-web.vercel.app`
- Frontend (latest preview example): `https://oil-shock-7a0bsn7d3-thomashillmans-projects.vercel.app`
- Worker API (production): `https://energy-dislocation-engine-production.tj-hillman.workers.dev`
- Worker API (preview): `https://energy-dislocation-engine-preview.tj-hillman.workers.dev`

## Architecture

- Backend runtime: Cloudflare Workers
- Persistence: Cloudflare D1 (`energy_dislocation`)
- Frontend: Vite + React
- CI: GitHub Actions (`.github/workflows/ci.yml`)
- Testing: Vitest (worker + app), replay validation, docs checks

Core flow:

1. Collect source signals into `series_points`
2. Compute mismatch state and write `signal_snapshots` and `run_evidence`
3. Serve snapshot-backed API responses
4. Render state/evidence/ledger views in frontend

## API Surface

- `GET /api/state`
- `GET /api/evidence`
- `GET /api/coverage`
- `GET /api/ledger/review`
- `POST /api/ledger`
- `PATCH /api/ledger/:id`
- `POST /api/admin/run-poc` (manual cycle trigger)

## Repository Layout

- `worker/` - Worker runtime, collectors, scorer, routes, core logic
- `app/` - Frontend UI, API client, tests
- `db/migrations/` - D1 schema migration files
- `docs/` - Deployment and replay docs
- `scripts/` - repo utility scripts (`replay-validate`, `docs-check`)
- `specs/` - planning and execution artifacts
- `.github/workflows/` - CI workflow definitions

## Local Development

Requirements:

- Node.js 24+
- Corepack enabled

Install:

```bash
corepack pnpm install
```

Apply local DB schema:

```bash
corepack pnpm db:migrate:local
```

Run worker:

```bash
corepack pnpm dev:worker
```

Run frontend:

```bash
corepack pnpm dev:web
```

## Quality and Validation Commands

- Full preflight: `corepack pnpm ci:preflight`
- Worker tests: `corepack pnpm -C worker test`
- Frontend tests: `corepack pnpm -C app test`
- Replay validation: `corepack pnpm replay:validate`
- Docs check: `corepack pnpm docs:check`

## Deployment and Infrastructure

See [docs/deploy.md](docs/deploy.md) for:

- Cloudflare Worker/D1 deployment commands
- Vercel frontend deployment and environment setup
- Preview/production routing model
- CORS and environment constraints

## Notes

- The frontend is configured to use `VITE_API_BASE_URL` and never exposes backend secrets.
- Worker CORS in production is pinned to `https://oil-shock-web.vercel.app`.
- Vercel Git-based builds rely on root `vercel.json` output configuration (`app/dist`).
