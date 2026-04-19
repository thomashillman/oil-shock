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

## Data Sources

All collectors live in `worker/src/jobs/collectors/`. Every emitted point is namespaced under one of three subscore dimensions: `price_signal.*`, `physical_stress.*`, `market_response.*`.

| Source | Endpoint(s) | Auth | Subscore dimension |
|---|---|---|---|
| **EIA v2** — WTI spot (`RWTC`) | `https://api.eia.gov/v2/petroleum/pri/spt/data` | `EIA_API_KEY` | `price_signal.spot_wti` |
| **EIA v2** — futures curve (`RCLC1`, `RCLC12`) | `https://api.eia.gov/v2/petroleum/pri/fut/data` | `EIA_API_KEY` | `price_signal.curve_slope` |
| **EIA v2** — US crude stocks (`WCESTUS1`) | `https://api.eia.gov/v2/petroleum/stoc/wstk/data` | `EIA_API_KEY` | `physical_stress.inventory_draw` |
| **EIA v2** — refinery utilization | `https://api.eia.gov/v2/petroleum/pnp/unc/data` | `EIA_API_KEY` | `physical_stress.refinery_utilization` |
| **EIA v2** — 3:2:1 crack spread (RBOB + ULSD + WTI) | `https://api.eia.gov/v2/petroleum/pri/spt/data` | `EIA_API_KEY` | `market_response.crack_spread` |
| **ENTSOG** — EU pipeline operational data | `https://transparency.entsog.eu/api/v1/operationaldatas` | none | `physical_stress.eu_pipeline_flow` |
| **GIE AGSI+** — EU gas storage | `https://agsi.gie.eu/api?type=eu` | `GIE_API_KEY` (header `x-key`) | `physical_stress.eu_gas_storage` |
| **SEC EDGAR** — 10-K / 10-Q / 8-K filings (5 sectors × 4–6 tickers) | `https://www.sec.gov/files/company_tickers.json`, `https://data.sec.gov/submissions/CIK*.json`, `https://www.sec.gov/Archives/edgar/data/*` | none (User-Agent required) | `market_response.sec_impairment` |

See **[CLAUDE.md → Data Sources & API Endpoints](CLAUDE.md#data-sources--api-endpoints)** for series IDs, normalization formulas, rolling windows, and `observedAt` provenance for each feed.

## Scoring at a Glance

The scoring engine produces a `mismatchScore` and a `dislocationState` from three subscores:

```
mismatchScore = clamp01(
  physicalStress
  − priceSignal
  + marketResponse × mismatch_market_response_weight  // default 0.15
)

coverageScore = clamp01(
  1
  − missingDimensions × coverage_missing_penalty      // default 0.34
  − staleDimensions   × coverage_stale_penalty        // default 0.16
)
```

The `dislocationState` (`aligned` / `mild_divergence` / `persistent_divergence` / `deep_divergence`) is a regime classification gated on score thresholds, confirmation gates (`physicalStress ≥ 0.6`, `priceSignal ≤ 0.45`, `marketResponse ≥ 0.5`), **and** dwell time in the current state (72h for persistent, 120h for deep). A `null` dwell time can never advance past `mild_divergence`. Stale critical data conservatively downgrades to `aligned`.

**Every numeric constant** (formula weights, gate thresholds, coverage penalties, dwell windows, ledger magnitudes) is stored in the `config_thresholds` D1 table — see **[CLAUDE.md → Configurable Thresholds](CLAUDE.md#configurable-thresholds)** for the full 20-row table and the workflow for changing values. Do not hardcode constants in code.

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
details, environment setup, and preview/production routing. For the frontend,
set `VITE_API_BASE_URL` in both Vercel preview and production environments.
