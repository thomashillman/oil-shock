# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Oil Shock is a low-cost energy dislocation state engine. It detects when physical energy constraints worsen faster than market pricing recognizes, exposing state snapshots and supporting evidence via API. The backend runs as a Cloudflare Worker with a D1 database; the frontend is a React/Vite app deployed on Vercel.

## Monorepo Structure

pnpm workspaces with two packages: `worker` (Cloudflare Worker + API) and `app` (React frontend).

- `worker/src/core/` — scoring, freshness evaluation, normalization, ledger logic
- `worker/src/jobs/` — collection pipeline (EIA, Gas, SEC collectors) and scoring pipeline
- `worker/src/routes/` — HTTP route handlers (`/api/state`, `/api/evidence`, `/api/coverage`, `/api/ledger`, `/api/admin/run-poc`)
- `worker/src/db/` — type-safe D1 client wrapper
- `worker/src/lib/` — shared utilities (logging, CORS, error classes, HTTP helpers)
- `worker/src/types.ts` — all shared TypeScript interfaces
- `worker/src/env.ts` — Cloudflare environment bindings interface
- `db/migrations/` — D1 SQL migrations
- `scripts/` — CI validation scripts (replay determinism, docs completeness checks)
- `specs/` — planning artifacts (Ralph design, requirements)

## Commands

**Requires Node 24+, pnpm 10.33.0, and `corepack enable`.**

```bash
# Install dependencies
corepack pnpm install

# Local development
corepack pnpm db:migrate:local    # Apply D1 schema locally (run once after install)
corepack pnpm dev:worker          # Worker on port 8787 (wrangler dev)
corepack pnpm dev:web             # Frontend on port 5173 (vite)

# Tests
corepack pnpm test                         # All tests
corepack pnpm -C worker test               # Worker tests only
corepack pnpm -C app test                  # App tests only
corepack pnpm -C worker vitest run <pattern>  # Single worker test file
corepack pnpm -C app vitest run <pattern>     # Single app test file

# Type checking and build
corepack pnpm typecheck           # All packages
corepack pnpm build               # All packages

# Validation (used in CI)
corepack pnpm replay:validate     # Determinism check for scoring logic
corepack pnpm docs:check          # Verify documentation completeness

# Full CI preflight
corepack pnpm ci:preflight        # lint + typecheck + test + build
```

## Core Scoring Logic

The scoring pipeline (`worker/src/jobs/score.ts`) is the central domain logic:

1. **Collection** (`runCollection`): Fetches from EIA, Gas, and SEC sources; normalizes into `series_points` (time-series rows) in D1.

2. **Scoring** (`runScore`): Reads signals, checks freshness, then computes multi-layer state:
   - **Subscores** (physical, recognition, transmission): Extracted as independent 0–1 metrics.
   - **Mismatch score**: `mismatchScore = clamp(physical - recognition + transmission * 0.15)`.
   - **Dislocation state** (computed in `worker/src/core/scoring/state-labels.ts`):
     - `aligned`: Low mismatch + low physical.
     - `mild_divergence`: Mismatch 0.3–0.5; market beginning to respond.
     - `persistent_divergence`: Mismatch 0.5–0.75; state held 3+ days.
     - `deep_divergence`: Mismatch ≥0.75; state held 5+ days; ≥2 confirmations.
   - **Actionability state** (legacy): `none` / `watch` / `actionable` for backward compatibility.
   - **Three clocks**:
     - `shockAge`: Time since mismatch first detected (acute < 72h, else chronic).
     - `dislocationAge`: Time in current dislocation state.
     - `transmissionAge`: Time since transmission signal emerged.
   - **Evidence classification** (per evidence item):
     - `confirming`: Supports dislocation thesis.
     - `counterevidence`: Weakens dislocation thesis.
     - `falsifier`: Directly contradicts thesis.
   - **Evidence coverage** (per evidence item):
     - `well`: Fresh source data.
     - `weakly`: Stale but not expired.
     - `not_covered`: Missing data.
   - **Ledger impact**: Applies 5–10% adjustment per active ledger entry (increase/decrease).
   - Writes results to `signal_snapshots` and `run_evidence`.

The API routes are **read-only** against precomputed snapshots — no computation happens at request time.

## Dislocation State Computation

The dislocation state is determined by regime rules (not a simple function of score):

```
IF score < 0.3 AND physicalScore < 0.5
  → aligned

ELSE IF score >= 0.3 AND score < 0.5
  → mild_divergence

ELSE IF score >= 0.5 AND score < 0.75 AND durationInState >= 3 days
  → persistent_divergence

ELSE IF score >= 0.75 AND physicalScore >= 0.6 AND recognitionScore <= 0.45 AND transmissionScore >= 0.5 AND durationInState >= 5 days
  → deep_divergence

IF critical data (physical OR recognition) is stale
  → downgrade to aligned (conservative)
```

The three clocks track temporal persistence:
- **Shock age** < 72 hours = "acute" phase (early-stage mismatch).
- **Dislocation age** measures how long the current state has held.
- **Transmission age** measures how long price signals have been responding.

Evidence classification follows the signal direction:
- **physical-pressure high** → confirming.
- **recognition gap large** → confirming (market lags).
- **transmission high** → confirming (prices responding).
- Opposite conditions = counterevidence or falsifier.

Ledger adjustments apply when entries are active (not retired, not stale):
- Each increase entry: +10% to final score (clamped 0–1).
- Each decrease entry: −10% to final score.

## Key Conventions

- **snake_case** for all DB column names; **camelCase** for TypeScript identifiers; **SCREAMING_SNAKE_CASE** for constants.
- Errors: throw `AppError` (from `worker/src/lib/`) with an HTTP status and an error code string.
- Logging: structured JSON via the logger in `worker/src/lib/`, always include a `context` object.
- D1 queries: use the `env.DB.prepare(sql).bind(...params).run()` pattern directly; no ORM.
- CORS: allowlist-based — localhost, `*.vercel.app`, and the configured `PRODUCTION_ORIGIN`.
- No ESLint or Prettier — TypeScript strict mode (`noUncheckedIndexedAccess`, etc.) is the primary guardrail.

## Environment Variables

**Worker** (set in `wrangler.jsonc` or via Cloudflare dashboard):
- `APP_ENV`: `local` | `preview` | `production`
- `PRODUCTION_ORIGIN`: frontend origin for CORS

**Frontend** (`.env` file in `app/`):
- `VITE_API_BASE_URL`: defaults to `http://127.0.0.1:8787` for local dev

## Database

D1 (SQLite). Schema is in `db/migrations/`. Key tables:
- `series_points` — raw time-series from collectors (indexed on `series_key, observed_at`)
- `signal_snapshots` — latest computed snapshot with mismatch score, dislocation state, subscores, clocks, ledger impact (indexed on `generated_at`)
- `state_change_events` — historical state transitions for computing clock ages (indexed on `generated_at`)
- `run_evidence` — evidence breakdown per scoring run with classification and coverage labels
- `impairment_ledger` — manually-tracked impairment entries (support retire/reinstate)
- `config_thresholds` — runtime-configurable scoring thresholds (state boundaries, temporal thresholds, ledger magnitude)

## Landmines

- **Vercel output directory**: Vercel defaults to looking for a `public` directory. This repo builds to `app/dist`. The `vercel.json` at the root sets `outputDirectory` and `buildCommand` correctly — don't remove it or change the output path without updating `vercel.json` to match.

- **D1 migrations must be applied via Wrangler, never ad-hoc**: The production D1 database (`energy_dislocation`, id `9db64b68-6ffc-4be2-a2c6-667691a5801f`) previously had migrations applied out of order (0004/0005 applied, 0002/0003 skipped), which surfaced as `D1_ERROR: no such column: evidence_classification` at runtime. Ad-hoc SQL execution bypasses Wrangler's `d1_migrations` tracking table, leaving the database in an inconsistent state with no audit trail.

  **Required workflow for any schema change:**

  1. **Author** the migration as a new, sequentially numbered file in `db/migrations/` (e.g., `0006_*.sql`). Never edit an existing migration that has been applied anywhere.
  2. **Apply locally first**: `corepack pnpm db:migrate:local` — confirm the change works against the local D1.
  3. **Run the full test suite** (`corepack pnpm test`) and `corepack pnpm replay:validate` before touching remote.
  4. **Apply to remote via Wrangler**, never via the Cloudflare dashboard, MCP SQL tool, or raw API:
     ```bash
     corepack pnpm wrangler d1 migrations apply energy_dislocation --remote
     ```
     This is the only path that updates the `d1_migrations` tracking table.
  5. **Verify** applied migrations on the remote:
     ```bash
     corepack pnpm wrangler d1 migrations list energy_dislocation --remote
     ```
     The output must list every file in `db/migrations/`. If any are missing, stop and investigate before deploying worker code that depends on them.
  6. **Deploy the worker only after** the migration is confirmed applied on remote. Schema changes lead code: migration first, then worker deploy.

  **If you find the remote DB in an inconsistent state** (missing `d1_migrations` table, or schema drift from the migration files): do not patch columns manually. Reconcile by backfilling the `d1_migrations` table to reflect what's actually applied, then run `wrangler d1 migrations apply --remote` to apply the true-missing ones. Document the reconciliation in the commit message.

## Testing Patterns

- Worker tests use an in-memory D1 mock (`worker/test/helpers/fake-d1.ts`).
- App tests use `@testing-library/react` with jest-dom matchers (setup in `app/src/test/setup.ts`).
- `scripts/replay-validate.mjs` runs the scoring pipeline against fixture inputs and asserts deterministic output — update fixtures when intentionally changing scoring behavior.
