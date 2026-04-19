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

The scoring pipeline (`worker/src/jobs/score.ts`) is the central domain logic. **All formula constants and gate thresholds are seeded into `config_thresholds` (see [Configurable Thresholds](#configurable-thresholds)) — never hardcode them in code.**

1. **Collection** (`runCollection`): Fetches from EIA, ENTSOG/GIE, and SEC EDGAR; normalizes into `series_points` rows in D1. Each `series_key` is namespaced under one of three dimensions: `price_signal.*`, `physical_stress.*`, `market_response.*`. See [Data Sources & API Endpoints](#data-sources--api-endpoints) for the full mapping.

2. **Scoring** (`runScore`): Loads thresholds, reads the latest series points, evaluates freshness, then computes:

   - **Three subscores** (each clamped to `[0, 1]`):
     - `physicalStress` — physical supply pressure (crude inventory draw, refinery utilization, EU pipeline flow stress, EU gas storage stress).
     - `priceSignal` — what spot/forward prices are saying (WTI spot vs. rolling p95, futures curve slope as backwardation indicator).
     - `marketResponse` — downstream market recognition (3:2:1 crack spread vs. baseline, SEC filing impairment language).
   - **Mismatch score**:
     ```
     mismatchScore = clamp01(
       physicalStress
       − priceSignal
       + marketResponse × thresholds.mismatchMarketResponseWeight
     )
     ```
     The `mismatchMarketResponseWeight` (default `0.15`) is read from `config_thresholds`, not literal in code.
   - **Coverage penalty** (applied to the snapshot's coverage score, not to `mismatchScore`):
     ```
     coverageScore = clamp01(
       1
       − missingCount × thresholds.coverageMissingPenalty       // 0.34
       − staleCount   × thresholds.coverageStalePenalty         // 0.16
     )
     ```
     Coverage is a **first-class scoring dimension**, not a display-only decoration.
   - **Dislocation state** — see [Dislocation State Computation](#dislocation-state-computation).
   - **Actionability state** (legacy `none` / `watch` / `actionable`) is computed pre-ledger in `compute.ts` for backward compatibility with older API consumers. Ledger adjustments do **not** influence actionability — only `dislocationState`.
   - **Three clocks** (`worker/src/core/scoring/clocks.ts`):
     - `shockAge` — hours since mismatch first detected. `< thresholds.shockAgeThresholdHours` (default 72h) → `"emerging"`, else `"chronic"`.
     - `dislocationAge` — duration in the current dislocation state, from `state_change_events`.
     - `transmissionAge` — hours since `marketResponse` signal first emerged.
   - **Evidence classification** per item (`confirming` / `counterevidence` / `falsifier`).
   - **Evidence coverage** per item (`well` / `weakly` / `not_covered`).
   - **Ledger impact** (`worker/src/core/ledger/impact.ts`): for each active (non-retired, non-stale) entry, apply `±thresholds.ledgerAdjustmentMagnitude` (default `0.10`) to the post-formula score, then re-derive `dislocationState`. Stale entries are those older than `thresholds.ledgerStaleThresholdDays` (default `30`).
   - Writes results to `signal_snapshots` and `run_evidence`.

The API routes are **read-only** against precomputed snapshots — no computation happens at request time.

## Dislocation State Computation

`worker/src/core/scoring/state-labels.ts` evaluates regime rules in priority order. **All numeric thresholds come from `config_thresholds`** — the values shown below are current defaults.

```
IF mismatchScore < stateAlignedMax (0.3) AND physicalStress < 0.5
  → aligned

ELSE IF mismatchScore >= stateDeepMin (0.75)
     AND physicalStress >= confirmationPhysicalStressMin (0.6)
     AND priceSignal    <= confirmationPriceSignalMax    (0.45)
     AND marketResponse >= confirmationMarketResponseMin (0.5)
     AND durationHours  != null
     AND durationHours  >= stateDeepPersistenceHours     (120 = 5 days)
  → deep_divergence

ELSE IF mismatchScore IN [statePersistentMin (0.5), statePersistentMax (0.75))
     AND physicalStress >= confirmationPhysicalStressMin
     AND priceSignal    <= confirmationPriceSignalMax
     AND durationHours  != null
     AND durationHours  >= statePersistentPersistenceHours (72 = 3 days)
  → persistent_divergence

ELSE IF mismatchScore IN [stateMildMin (0.3), statePersistentMin (0.5))
  → mild_divergence

ELSE IF mismatchScore >= statePersistentMin
  → mild_divergence  // catch-all: high score but duration gate not yet met (or null duration)

IF freshness.physicalStress == "stale" OR freshness.priceSignal == "stale"
  → downgrade to aligned (rationale appended with [STALE DATA: confidence downgraded])
```

**Critical invariant**: a `null` `durationHours` (first-ever snapshot, or no prior `state_change_events`) must **never** advance to `persistent_divergence` or `deep_divergence` — the `null`-duration check above is what prevents a cold-start jump to deep. The replay fixture `null_duration_high_score` enforces this.

The three clocks track temporal persistence:
- **Shock age** < `shockAgeThresholdHours` (default 72h) → `"emerging"`, else `"chronic"`.
- **Dislocation age** measures how long the current dislocation state has held.
- **Transmission age** measures how long the `marketResponse` signal has been elevated.

Evidence classification follows the signal direction:
- **`physicalStress` high** → confirming (real physical pressure).
- **`priceSignal` low while `physicalStress` high** → confirming (market lags; this is the dislocation thesis).
- **`marketResponse` high** → confirming (downstream recognition emerging).
- Opposite conditions → counterevidence or falsifier.

Ledger adjustments apply when entries are active (not retired, not older than `ledgerStaleThresholdDays`):
- Each `increase` entry: `+ledgerAdjustmentMagnitude` to the score (clamped to `[0, 1]`).
- Each `decrease` entry: `−ledgerAdjustmentMagnitude` to the score.
- Default magnitude is `0.10` per entry, configurable via `ledger_adjustment_magnitude`.

## Data Sources & API Endpoints

All collectors live in `worker/src/jobs/collectors/`. Each collector emits `NormalizedPoint`s with a `seriesKey` namespaced under exactly one dimension (`price_signal.*`, `physical_stress.*`, `market_response.*`). The `observedAt` field comes from the upstream feed (EIA `period`, ENTSOG `periodFrom`, GIE `gasDayStart`, SEC `filingDate`) — never from the wall clock unless the upstream omits it (warning is logged in that case).

### EIA — `worker/src/jobs/collectors/eia.ts`

Base: `https://api.eia.gov/v2/`. Auth: `EIA_API_KEY` query param. Date window is rolling: `endDate = today`, `startDate = today − 60 days` (daily) or `today − 26 weeks` (weekly). **No hardcoded dates** — historic bug was a fixed `2026-02-01 → 2026-04-18` window.

| Endpoint | Series ID(s) | Frequency | Series key | Normalization |
|---|---|---|---|---|
| `petroleum/pri/spt/data` | `RWTC` (WTI Cushing spot) | daily | `price_signal.spot_wti` | `value / p95(rolling 180-day history)` clamped to `[0, 1]`. Falls back to `value / 120` if no baseline yet. |
| `petroleum/pri/fut/data` | `RCLC1` (front month), `RCLC12` (12-month-out) | daily | `price_signal.curve_slope` | `slope = (front − far) / abs(front)`. Linear rescale `[−0.15, +0.15] → [1, 0]` (backwardation = high signal, contango = low). |
| `petroleum/stoc/wstk/data` | `WCESTUS1` (US crude stocks ex-SPR) | weekly | `physical_stress.inventory_draw` | `(seasonal_5yr_avg − latest) / seasonal_5yr_avg` clamped `[0, 1]`. Falls back to prior-week delta if baseline missing. |
| `petroleum/pnp/unc/data` | refinery operable capacity utilization | monthly | `physical_stress.refinery_utilization` | `value / 100` clamped `[0, 1]`. (Note: high utilization = high physical stress signal.) |
| `petroleum/pri/spt/data` | `EER_EPMRR_PF4_RGC_DPG` (RBOB gasoline), `EER_EPD2F_PF4_RGC_DPG` (ULSD distillate), `RWTC` (crude) | daily | `market_response.crack_spread` | 3:2:1 crack: `(2·gasoline·42 + distillate·42 − 3·crude) / crude`. Z-scored against rolling 180-day baseline, clamped `[0, 1]`. |

`observedAt` is taken from the EIA `period` field on each row (e.g. `"2026-04-15"`). If `period` is missing, `extractPeriod()` falls back to `nowIso` and logs a warning.

### Gas (ENTSOG + GIE AGSI+) — `worker/src/jobs/collectors/gas.ts`

**ENTSOG** (EU pipeline flows, no auth):
- Endpoint: `https://transparency.entsog.eu/api/v1/operationaldatas`
- Indicators queried: `Nomination`, `Physical Flow`, `Firm Available`, `Firm Technical`, `Firm Booked`
- Window: 30-day rolling
- Output series key: `physical_stress.eu_pipeline_flow`
- Normalization: `stress = 1 − (physical_flow / nomination)` aggregated across operators, clamped `[0, 1]`. Missing values emit no point (do not default to `0.5`) so freshness correctly flags the gap.
- `observedAt` from `periodFrom`.

**GIE AGSI+** (EU gas storage):
- Endpoint: `https://agsi.gie.eu/api?type=eu`
- Auth header: `x-key: <env.GIE_API_KEY>` — **never hardcode this key** (a previous version had it inline at `gas.ts:102`; rotate any exposed key out-of-band).
- Output series key: `physical_stress.eu_gas_storage`
- Normalization: `stress = 1 − (gasInStorage / workingGasVolume)`, clamped `[0, 1]`. Higher = more depleted = more physical stress.
- `observedAt` from `gasDayStart`.

### SEC EDGAR — `worker/src/jobs/collectors/sec.ts`

No auth. SEC requests should send a real User-Agent (handled in `worker/src/lib/http-client.ts`).

1. `GET https://www.sec.gov/files/company_tickers.json` → builds CIK lookup map. If this fails, the collector returns `[]` (no stub data) so the series goes `missing` and coverage degrades.
2. For each ticker in `TICKERS_BY_SECTOR` (5 sectors × 4–6 tickers — airlines/logistics: `DAL UAL AAL FDX UPS JBHT`; chemicals: `DOW LYB EMN WLK DD`; retail: `WMT COST TGT KR`; utilities: `DUK SO NEE SRE LNG`; producers/refiners: `XOM CVX COP MPC VLO`):
   - `GET https://data.sec.gov/submissions/CIK{cik10}.json` → recent filings list.
   - For up to the 4 most recent filings of form `10-K`, `10-Q`, or `8-K`: `GET https://www.sec.gov/Archives/edgar/data/{cikNum}/{accessionNoDashes}/{primaryDocument}`.
3. Filing text is HTML-stripped, then scored:
   - **Keyword match** (per-sector list, e.g. `fuel`, `jet fuel`, `diesel`, `feedstock`, `crack spread`): word-boundary regex `\b<keyword>\b` (so `fuel` does **not** match `refuel`). Any match → `hasOilLinkage = 1`.
   - **Negative guidance** patterns: `lowered guidance`, `cut guidance`, `withdrew guidance`, `softer demand`, `margin pressure`, `higher fuel costs`, etc. Counter-balanced by positive patterns (`raised guidance`, `reaffirmed guidance`, `offset`, `cost recovery`).
   - `impairmentScore = hasOilLinkage × 0.5 + guidanceRisk × 0.5`.
4. Average across all scored companies → emitted as **single point** with series key `market_response.sec_impairment`, value `min(1, avgScore)`.
5. `observedAt` is the most recent `filingDate` across scored tickers (falls back to `nowIso` if none parseable).

### Freshness windows — `worker/src/core/freshness/evaluate.ts`

Each dimension's most recent `observedAt` is compared to `Date.now()`:
- `physicalStress` → `fresh` if ≤ **8 days** old, else `stale`. `null` → `missing`.
- `priceSignal` → `fresh` if ≤ **3 days** old, else `stale`.
- `marketResponse` → `fresh` if ≤ **8 days** old, else `stale`.

These windows are currently inlined in `evaluate.ts` (not yet promoted to `config_thresholds`). If you need to tune them, change the literals there and update this section.

## Configurable Thresholds

All scoring constants live in `config_thresholds` (key/value rows). The TypeScript view is `ScoringThresholds` in `worker/src/types.ts`, loaded by `loadThresholds` in `worker/src/db/client.ts`. **Every key listed below is in the `required` tuple in `loadThresholds` — a missing seed row throws `MISSING_THRESHOLD` at startup.** This is intentional; see the "Data-seed migrations" landmine below.

After applying migrations, the table must contain **20 rows** (10 from `0004_config_thresholds.sql`, 10 from `0006_promote_scoring_constants.sql`).

### From `db/migrations/0004_config_thresholds.sql`

| Key | Default | Used by | Purpose |
|---|---|---|---|
| `state_aligned_threshold_max` | `0.3` | state-labels | upper bound for `aligned` |
| `state_mild_threshold_min` | `0.3` | state-labels | lower bound for `mild_divergence` |
| `state_mild_threshold_max` | `0.5` | state-labels | upper bound for `mild_divergence` |
| `state_persistent_threshold_min` | `0.5` | state-labels | lower bound for `persistent_divergence` |
| `state_persistent_threshold_max` | `0.75` | state-labels | upper bound for `persistent_divergence` |
| `state_deep_threshold_min` | `0.75` | state-labels | lower bound for `deep_divergence` |
| `shock_age_threshold_hours` | `72` | clocks | `< threshold` → `"emerging"`, else `"chronic"` |
| `dislocation_persistence_threshold_hours` | `72` | clocks (legacy) | retained for backward compatibility |
| `transmission_freshness_threshold_days` | `8` | clocks (legacy) | retained for backward compatibility |
| `ledger_adjustment_magnitude` | `0.1` | ledger/impact | per-entry `±` adjustment to score |

### From `db/migrations/0006_promote_scoring_constants.sql`

| Key | Default | Used by | Purpose |
|---|---|---|---|
| `mismatch_market_response_weight` | `0.15` | compute | weight on `marketResponse` in mismatch formula |
| `confirmation_physical_stress_min` | `0.6` | state-labels | confirmation gate for persistent/deep |
| `confirmation_price_signal_max` | `0.45` | state-labels | confirmation gate for persistent/deep |
| `confirmation_market_response_min` | `0.5` | state-labels | confirmation gate for deep only |
| `coverage_missing_penalty` | `0.34` | compute | per-missing-dimension penalty on coverage |
| `coverage_stale_penalty` | `0.16` | compute | per-stale-dimension penalty on coverage |
| `coverage_max_penalty` | `1.0` | compute | hard cap on coverage penalty |
| `state_deep_persistence_hours` | `120` | state-labels | minimum dwell time before `deep_divergence` (5 days) |
| `state_persistent_persistence_hours` | `72` | state-labels | minimum dwell time before `persistent_divergence` (3 days) |
| `ledger_stale_threshold_days` | `30` | ledger/impact | ledger entries older than this are ignored |

**To change a threshold**: write a new sequentially-numbered migration that does `INSERT OR REPLACE INTO config_thresholds (key, value) VALUES (...)`. Never edit `0004` or `0006` after they have been applied to any environment. After applying, re-run `corepack pnpm replay:validate` to confirm the new value still produces deterministic, expected behavior on all fixture windows.

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

**Secrets** (never committed — inject via `wrangler secret put`):
- `EIA_API_KEY`: EIA v2 API key (https://www.eia.gov/opendata/)
- `GIE_API_KEY`: GIE AGSI+ API key (https://agsi.gie.eu/)

For local development, copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in real values. The `.dev.vars` file is gitignored.

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

- **Check for `d1_migrations` before any deploy that depends on a migration**: The tracking table's absence is silent — the app boots, tables exist, but Wrangler has no state and will attempt to re-run all migrations from scratch on the next `apply`. Verify it exists before touching remote:
  ```sql
  SELECT name FROM sqlite_master WHERE name = 'd1_migrations';
  ```
  If missing, all prior migrations were applied ad-hoc. Reconcile first (see above) before running any further `wrangler d1 migrations apply`.

- **Data-seed migrations (INSERT-only) are invisible when skipped**: Migrations that only contain `INSERT` statements (e.g. `0004_config_thresholds.sql`) leave no schema evidence if skipped — the table exists, it's just empty. The scoring pipeline will boot and collect data normally, but `runScore` will throw `MISSING_THRESHOLD` on the very first call to `loadThresholds`, which is invoked *outside* the try-catch in `score.ts`. This means `finishRun` is never called, runs stay stuck at `status = 'running'` forever, no new snapshots are written, and the Recalculate button on the frontend will spin until the 90-second poll timeout with no visible error. After any migration apply, verify config data is present:
  ```sql
  SELECT COUNT(*) FROM config_thresholds; -- must return 20 (10 from 0004 + 10 from 0006)
  ```

- **Stuck `running` runs mean the error is before the try-catch in `score.ts`**: If `SELECT status, COUNT(*) FROM runs GROUP BY status` shows runs permanently stuck at `running` with no `failed` rows, the error is thrown before the try block — not caught, `finishRun` never called. Check `config_thresholds` row count first. Do not add new `INSERT` calls or schema changes to diagnose; fix the root cause (missing seed data or missing migration).

- **`ALTER TABLE` DEFAULT values on `signal_snapshots` create misleading zero-data rows**: When columns are added to `signal_snapshots` via `ALTER TABLE ... ADD COLUMN ... DEFAULT '{"physical":0,...}'`, all existing rows silently receive zeros for those fields. This produces snapshots where `subscores_json` shows all zeros while `mismatch_score` is non-zero — which looks like a scoring bug but is actually stale rows with default values. Use `DEFAULT 'null'` or a distinguishable sentinel instead of numeric defaults so pre-migration rows are identifiable as such.

- **`POST /api/admin/run-poc` must use `ctx.waitUntil`, never `await`**: The collection + scoring pipeline takes longer than Cloudflare's CPU budget for a single request. If the handler uses `await runCollection(env); await runScore(env)`, Cloudflare will kill the request mid-execution, no snapshot is written, and the frontend Recalculate button spins indefinitely. The handler must return immediately via `ctx.waitUntil(runCollection(env).then(() => runScore(env)))`. The `fetch` handler signature must include `ctx: ExecutionContext` as the third parameter.

- **Frontend and worker each define their own `Subscores` / `FreshnessSummary` interfaces**: `app/src/components/StateView.tsx` and `worker/src/types.ts` live in separate packages (`app/` and `worker/`), and TypeScript has no cross-workspace coupling by default. A rename on one side (e.g. `physical` → `physicalStress`) compiles cleanly on both sides in isolation, but produces a runtime `undefined → 0%` mismatch in the UI that **looks exactly like a scoring bug**. The guardrail is `app/src/types/api-contract.ts`, which imports the worker's types via relative path and asserts structural equality — any drift on either side now fails `corepack pnpm typecheck`. The complementary runtime guard is `worker/test/routes/state.test.ts`, which asserts the `/api/state` response has exactly the expected key set. Never add a shape-mapping shim in `normalizeStatePayload` to paper over drift — fix the types so both guards pass.

- **`signal_snapshots.subscores_json` schema changes strand old rows**: When the subscore key set is renamed (e.g. PR #28's `physical/recognition/transmission` → `physicalStress/priceSignal/marketResponse`), historical `signal_snapshots` rows still hold the **old** JSON shape. `/api/state` returns the latest row verbatim, and the frontend renders `undefined → 0%` for every renamed key. The symptom is "one subscore bar has a real value, the others are all 0%" — indistinguishable from a scoring bug. On any such rename: (a) accept that only post-migration snapshots are correct and block production deploy until a fresh snapshot exists, or (b) ship a migration that rewrites `subscores_json` on existing rows. **Do NOT add backward-compat fallbacks in `state.ts` or the frontend** — they become permanent cruft. The CI post-deploy smoke check in `.github/workflows/ci.yml` (`Smoke-check preview /api/state subscore shape`) catches shape drift on the preview worker before production deploy.

- **Recalculate button silent timeouts hide real failures**: `app/src/App.tsx`'s recalc flow POSTs `/api/admin/run-poc` and polls `/api/state` for 90s. When the worker is actually broken (e.g. `loadThresholds` throwing pre-try-catch, D1 outage, pre-rename stale snapshot never refreshing), the UI goes from spinner → back to idle with **no visible error** — indistinguishable from "the user tapped and waited long enough." The fix is a `recalcError` state that is set on POST non-2xx, POST network error, or the 90s poll deadline, and surfaced as a dismissable banner. Two tests lock this behavior in (`App.test.tsx`: `surfaces a visible error when Recalculate POST returns 500` and `surfaces a timeout error when the new snapshot never arrives within the deadline`). When these tests go red, **do NOT** loosen them — a silent recalc is the symptom that makes every other bug on this list harder to diagnose.

## Testing Patterns

- Worker tests use an in-memory D1 mock (`worker/test/helpers/fake-d1.ts`).
- App tests use `@testing-library/react` with jest-dom matchers (setup in `app/src/test/setup.ts`).
- `scripts/replay-validate.ts` runs the **real scoring engine** (imports `computeSnapshot`, `applyLedgerAdjustments`, `computeDislocationState` from `worker/src/core/scoring/`) against fixture inputs in `worker/test/fixtures/replay-windows.json`, and asserts deterministic output across two identical runs. Update fixtures when intentionally changing scoring behavior. Each fixture must specify both `expectedDislocationState` and `expectedActionabilityState`. Critical fixture `null_duration_high_score` enforces the cold-start guard (high score with `durationHours = null` must NOT advance to `deep_divergence`).
