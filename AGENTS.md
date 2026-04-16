# AGENTS.md

Project-level guidance for coding agents working in `oil-shock`.

## Objective

Maintain and extend a live energy dislocation platform with:

- Cloudflare Worker API + scheduled processing
- Cloudflare D1 persistence
- Vercel-hosted frontend

Preserve production behavior unless an explicit change is requested.

## Working Rules

1. Keep changes small, coherent, and directly tied to requirements.
2. Do not break the live deployment paths for Worker or frontend.
3. Prefer extending existing modules over introducing new architecture layers.
4. Do not hardcode secrets or add sensitive values to source.
5. Treat API contracts as stable unless a contract change is intentional and documented.

## Repository Conventions

- Package manager: `pnpm` via `corepack` (`packageManager` is pinned).
- TypeScript strictness is expected in both `worker/` and `app/`.
- Worker code lives under `worker/src/`.
- Frontend code lives under `app/src/`.
- D1 schema changes must be migration-driven (`db/migrations/*.sql`).

## High-Value Commands

Run these before proposing a PR:

```bash
corepack pnpm ci:preflight
corepack pnpm replay:validate
corepack pnpm docs:check
```

Focused checks:

```bash
corepack pnpm -C worker test
corepack pnpm -C app test
corepack pnpm -C app build
```

## Deployment Guardrails

### Cloudflare

- Config source: `wrangler.jsonc`
- Ensure `d1_databases` are present under each deployed environment (`preview`, `production`).
- Do not remove or rename Worker env variables without coordinating frontend/config updates.

### Vercel

- Frontend build output must remain `app/dist`.
- Root `vercel.json` controls Git-based build behavior; keep it aligned with app build output.
- `VITE_API_BASE_URL` must point to the appropriate Worker endpoint.

## API and UI Expectations

The UI currently expects these endpoints:

- `GET /api/state`
- `GET /api/evidence`
- `GET /api/coverage`
- `GET /api/ledger/review`
- `POST /api/admin/run-poc`

When changing payload shape, update:

- `app/src/api.ts`
- `app/src/App.tsx`
- contract tests in `worker/test/contracts/`

## Testing Expectations

- Add or update tests with any behavior change.
- Prefer deterministic fixtures for scoring and replay logic.
- Avoid flaky tests and network-dependent test paths.

## Documentation Expectations

Update docs whenever behavior changes:

- `README.md` for user-facing usage and status
- `docs/deploy.md` for deploy/config changes
- `specs/oil-shock-mvp/tasks.md` or progress artifacts only if operating within that workflow

## Git and PR Hygiene

- Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`).
- Keep PR descriptions explicit about:
  - what changed
  - why it changed
  - how it was validated
- For infra-related changes, include live endpoint impact.
