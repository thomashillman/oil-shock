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
- `EIA_API_KEY`: U.S. Energy Information Administration API key (required for live EIA data)
- `GIE_API_KEY`: Gas Infrastructure Europe AGSI/ALSI API key (required for live GIE data)

**Frontend** (`.env` file in `app/`):
- `VITE_API_BASE_URL`: defaults to `http://127.0.0.1:8787` for local dev

## Data Collectors (Live APIs)

### EIA Collector (`worker/src/jobs/collectors/eia.ts`)

Fetches from **U.S. Energy Information Administration v2 API** (https://api.eia.gov/v2).

**Route-based discovery pattern:**
- Discovers available facets and data columns via metadata endpoint
- Generic `fetchRouteData()` supports any route with configurable data columns and facets
- Pagination: offset/length with 5000-row max per request

**Currently tracked routes:**
1. `petroleum/pri/spt` (Petroleum Spot Prices)
   - Brent crude (series: RBRTE) → `physical.inventory_draw`
   - WTI crude (series: RWTC) → `physical.utilization`

2. `natural-gas/stor/cap` (Natural Gas Storage Capacity)
   - Weekly storage data → `recognition.curve_signal`

3. `natural-gas/pri` (Natural Gas Prices)
   - Daily/monthly prices → `transmission.crack_signal`

**Rate limiting:** 150ms minimum between requests (per EIA guidance)  
**Timeout:** 45 seconds per request  
**Fallback:** Returns empty array if API unavailable; scoring continues with other sources

**To verify facet IDs match live metadata:**
```bash
curl "https://api.eia.gov/v2/petroleum/pri/spt?api_key=YOUR_KEY" | jq .response.facets
```

### Gas Collector (`worker/src/jobs/collectors/gas.ts`)

Integrates **ENTSOG Transparency API** and **GIE AGSI/ALSI APIs** for European gas infrastructure stress.

#### ENTSOG (Transparency Platform)
- **Base:** https://transparency.entsog.eu/api/v1
- **Endpoint:** `operationaldatas` with tight filters
- **Tracked indicators:** Nomination, Physical Flow, Firm Available, Firm Technical, Firm Booked
- **Date windows:** Minimal (30 days) to avoid 60-second timeout
- **Aggregation:** Computes stress ratios:
  - `flow_vs_nomination_ratio`: Physical Flow / Nomination (< 0.9 = stress)
  - `booked_vs_technical_ratio`: Firm Booked / Firm Technical (> 0.8 = stress)
- **Maps to:** `recognition.curve_signal` (1 - flow_ratio)

#### GIE AGSI (Storage Inventory System)
- **Base:** https://agsi.gie.eu/api
- **Headers:** Required `x-key: GIE_API_KEY` on every request
- **Pagination:** `page` and `size` (max 300/page)
- **Tracked data:** EU-level (type: eu)
  - `full`: Storage fullness percentage (< 35% = stress)
  - `gasInStorage`: Current inventory
  - `workingGasVolume`: Total usable capacity
  - `injection`/`withdrawal`: Daily flows
- **Maps to:** 
  - `physical.inventory_draw` (1 - storage_ratio)
  - `physical.utilization` (net_withdrawal normalized)

**Rate limiting:** 150ms between requests  
**Timeout:** 60s (ENTSOG), 30s (GIE)  
**Fallback:** Partial data; continues with available sources

### SEC Collector (`worker/src/jobs/collectors/sec.ts`)

Fetches from **SEC EDGAR via data.sec.gov** (no authentication required).

**Two-phase approach:**

1. **Ticker Map Discovery** (once per collection)
   - Fetches: https://www.sec.gov/files/company_tickers.json
   - Maps ticker symbols (e.g., "XOM") to CIK numbers

2. **Company Analysis** (per ticker)
   - **XBRL Facts:** Fetches `companyfacts/CIK{cik}.json` for latest 6 quarters
   - **Recent Filings:** Pulls 10-K, 10-Q, 8-K text from last 4 filings
   - **Keyword extraction:** Scores on energy linkage (fuel, feedstock, commodity, etc.)
   - **Guidance scoring:** Detects negative patterns (margin pressure, lower guidance, etc.)

**Tracked sectors (7 groups):**
- Airlines/Trucking/Shipping/Logistics: DAL, UAL, AAL, FDX, UPS, JBHT
- Chemicals/Plastics/Industrials: DOW, LYB, EMN, WLK, DD
- Retail/Consumer/Food: WMT, COST, TGT, KR
- Utilities/Power/LNG/Energy: DUK, SO, NEE, SRE, LNG
- Oil Producers/Refiners: XOM, CVX, COP, MPC, VLO
- (Plus smaller representative tickers in each)

**Scoring logic:**
- Averages impairment scores across all tracked tickers
- Energy linkage presence: +0.5 points
- Negative guidance: +guidance_risk points (1–3)
- Pricing power/hedging: −0.75 points (offsets risk)

**Maps to:** `transmission.impairment_mentions` (0–1 normalized average)

**Timeouts:**
- Ticker map: 15s
- Submissions: 10s
- Company facts: 10s
- Filing text: 15s

**Fallback:** Returns average of successfully-fetched tickers; empty array if all fail

### HTTP Client (`worker/src/lib/http-client.ts`)

Shared layer for all API calls with built-in resilience:

**Features:**
- **Exponential backoff:** 2s, 4s, 8s, 16s retry delays
- **Rate limiting:** Global 150ms minimum between all requests (configurable per call)
- **Timeout handling:** Configurable per API (default 30s)
- **Structured logging:** All API calls and errors logged with context

**Usage pattern:**
```typescript
const data = await fetchJson<T>(url, {
  timeout: 45000,
  retries: 4,
  backoffMs: 2000,
  rateLimitDelayMs: 150,
  headers: { "x-key": apiKey }
});
```

### Data Normalization

All collectors return `NormalizedPoint[]`:
```typescript
interface NormalizedPoint {
  seriesKey: string;      // physical.* | recognition.* | transmission.*
  observedAt: string;     // ISO timestamp
  value: number;          // 0–1 clamped
  unit: string;           // "index"
  sourceKey: string;      // "eia" | "gas" | "sec"
}
```

**Series key mapping:**
- **Physical** (energy supply/inventory stress):
  - `physical.inventory_draw`: EIA crude/product inventory levels (higher = less stress)
  - `physical.utilization`: EIA/GIE capacity utilization (higher = more stress)
- **Recognition** (market awareness):
  - `recognition.curve_signal`: ENTSOG/GIE operational flow-nomination ratio (lower = stress gap)
- **Transmission** (price response):
  - `transmission.crack_signal`: EIA natural gas price relative movement
  - `transmission.impairment_mentions`: SEC filing guidance + energy linkage scoring



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
  SELECT COUNT(*) FROM config_thresholds; -- must return 10
  ```

- **Stuck `running` runs mean the error is before the try-catch in `score.ts`**: If `SELECT status, COUNT(*) FROM runs GROUP BY status` shows runs permanently stuck at `running` with no `failed` rows, the error is thrown before the try block — not caught, `finishRun` never called. Check `config_thresholds` row count first. Do not add new `INSERT` calls or schema changes to diagnose; fix the root cause (missing seed data or missing migration).

- **`ALTER TABLE` DEFAULT values on `signal_snapshots` create misleading zero-data rows**: When columns are added to `signal_snapshots` via `ALTER TABLE ... ADD COLUMN ... DEFAULT '{"physical":0,...}'`, all existing rows silently receive zeros for those fields. This produces snapshots where `subscores_json` shows all zeros while `mismatch_score` is non-zero — which looks like a scoring bug but is actually stale rows with default values. Use `DEFAULT 'null'` or a distinguishable sentinel instead of numeric defaults so pre-migration rows are identifiable as such.

- **`POST /api/admin/run-poc` must use `ctx.waitUntil`, never `await`**: The collection + scoring pipeline takes longer than Cloudflare's CPU budget for a single request. If the handler uses `await runCollection(env); await runScore(env)`, Cloudflare will kill the request mid-execution, no snapshot is written, and the frontend Recalculate button spins indefinitely. The handler must return immediately via `ctx.waitUntil(runCollection(env).then(() => runScore(env)))`. The `fetch` handler signature must include `ctx: ExecutionContext` as the third parameter.

- **API collector failures are graceful but visible in logs**: When EIA, ENTSOG/GIE, or SEC APIs are unavailable (timeouts, rate limits, auth errors), the collectors return partial data or empty arrays. The scoring pipeline continues with whatever was collected. Check logs (JSON structured with level, message, context) to diagnose which APIs failed:
  ```json
  {"level":"warn","message":"ENTSOG fetch failed","indicator":"Physical Flow","error":"HTTP 503: Service Unavailable"}
  ```
  The scoring pipeline will still produce a snapshot, but with fewer confirmed signals. This is intentional resilience.

- **Missing API keys cause real API calls to fail silently**: If `EIA_API_KEY` or `GIE_API_KEY` are not set in the Cloudflare Workers environment, the HTTP client will receive 403 Forbidden or 401 Unauthorized. Collectors log these as failures and return empty arrays. Verify keys are present in Cloudflare dashboard (Settings > Environment Variables). For local testing, `createTestEnv()` provides placeholder keys (`test-eia-key`, `test-gie-key`) — do not use these for real API calls.

- **SEC EDGAR rate limiting** (429 Too Many Requests): If many tickers are fetched in succession, the SEC API may rate-limit. The exponential backoff (2s, 4s, 8s, 16s) handles transient limits. If persistent, add delays between tickers or reduce the ticker list in `TICKERS_BY_SECTOR` (currently ~40 tickers tracked across 7 sectors).

## Testing Patterns

- Worker tests use an in-memory D1 mock (`worker/test/helpers/fake-d1.ts`).
- App tests use `@testing-library/react` with jest-dom matchers (setup in `app/src/test/setup.ts`).
- `scripts/replay-validate.mjs` runs the scoring pipeline against fixture inputs and asserts deterministic output — update fixtures when intentionally changing scoring behavior.

### API Collector Testing

**Test environment isolation:**
- Real API calls are executed during tests (with real timeouts and rate limiting).
- Test fixtures provide mock credentials (`test-eia-key`, `test-gie-key`) to the collector functions.
- If real APIs are unavailable (503 errors, rate limits), collectors gracefully fall back to partial or empty data.
- The scoring pipeline continues normally with whatever normalized points were collected.

**Test timeouts:**
- Tests that call `runCollection()` (e.g., `pipeline.test.ts`, `api.test.ts`) have **30000ms timeout** to accommodate SEC API latency.
- Default test timeout is 5000ms; real API calls can exceed this in CI environments.
- Mock API responses are not used in tests — all integration tests exercise real API paths.

**Expected test behavior:**
- ENTSOG/GIE APIs often return 503 during tests (service boundaries); graceful fallback keeps tests passing.
- SEC ticker fetch may timeout; test still completes via fallback to mock score.
- Overall determinism check (`replay:validate`) verifies scoring logic is unaffected by partial data variations.

**To test local mock vs. live:**
- Live APIs are called by default during tests.
- To mock API responses, modify `fetchJson()` and `fetchText()` in collector files to use test doubles.
- Tests pass as long as scoring pipeline completes and writes `signal_snapshots` to D1.
