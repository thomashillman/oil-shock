# Oil Shock

Oil Shock is a low-cost energy dislocation state engine. It detects when
physical energy constraints appear to be worsening faster than market pricing
recognizes, then exposes a snapshot state and supporting evidence.

## Architecture

- Backend: Cloudflare Workers
- Storage: Cloudflare D1
- Frontend: Vite + React (Vercel-friendly)
- Validation: Vitest + replay validation + docs checks

Core runtime flow:

1. Collect source signals into `series_points`
2. Score mismatch and write `signal_snapshots` + `run_evidence`
3. Serve precomputed API responses (`/api/state`, `/api/evidence`, `/api/coverage`)

## Repository Layout

- `worker/` - Worker runtime, scoring pipeline, API routes
- `app/` - Frontend scaffold
- `db/migrations/` - D1 schema migrations
- `docs/` - Deployment and replay validation docs
- `scripts/` - CI/support scripts
- `specs/` - Ralph planning and execution artifacts

## Quick Start

Requirements:

- Node.js 24+
- Corepack enabled (`corepack enable`)

Install:

```bash
corepack pnpm install
```

Run local migration:

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

## Validation Commands

- Full preflight: `corepack pnpm ci:preflight`
- Replay validation: `corepack pnpm replay:validate`
- Docs check: `corepack pnpm docs:check`
- Worker tests: `corepack pnpm -C worker test`
- App tests: `corepack pnpm -C app test`

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

The workflow runs on `push` and `pull_request` against `main` and executes:

- Install (`pnpm install --frozen-lockfile`)
- Preflight checks (`pnpm ci:preflight`)
- Replay validation (`pnpm replay:validate`)
- Docs check (`pnpm docs:check`)

## Deployment

See [docs/deploy.md](docs/deploy.md) for Cloudflare and Vercel deployment
details, environment setup, and preview/production routing.
