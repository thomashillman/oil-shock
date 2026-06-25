# Architecture

This document describes the current implemented architecture of this repository.

It is intentionally about the code that exists today. The planned Macro Signals direction matters for sequencing and abstraction choices, but it does not override the current implementation. Use this document to understand the present Oil Shock system before making changes.

## Scope and current-state warning

- The current repo is still a single-engine Oil Shock system.
- The current implementation source of truth is the code on `main`.
- Do not assume multi-engine tables, feed registries, rule engines, or engine-scoped endpoints already exist.
- If you introduce target-state structures, stage them deliberately and keep the current Oil Shock path working unless the task explicitly says otherwise.

## System overview

- Backend: Cloudflare Worker
- Storage: Cloudflare D1
- Frontend: Vite + React
- Validation: Vitest, replay validation, and docs checks

The runtime shape is intentionally simple:

1. Collect source signals into `series_points`
2. Score mismatch and write `signal_snapshots` plus `run_evidence`
3. Serve precomputed API responses to the frontend

## Repository map

- `worker/src/core/`: scoring, freshness, normalisation, ledger logic
- `worker/src/engines/`: engine-scoped runtime slices (currently `oilshock`)
- `worker/src/jobs/`: collection and scoring pipelines
- `worker/src/routes/`: HTTP route handlers
- `worker/src/db/`: D1 access layer
- `worker/src/lib/`: runtime helpers
- `worker/src/types.ts`: shared TypeScript contracts
- `db/migrations/`: schema and seed migrations
- `app/`: React frontend
- `scripts/`: validation and CI support scripts
- `docs/`: deployment and durable project docs
- `specs/`: planning artefacts

## API surface

Current Worker routes include:

- `GET /health`
- `GET /api/state`
- `GET /api/state/history`
- `GET /api/evidence`
- `GET /api/coverage`
- `GET /api/ledger/review`
- `GET /api/v1/energy/state`
- `GET /api/feed-health`
- `GET /api/engines`
- `GET /api/engines/energy/runtime`
- `POST /api/ledger`
- `PATCH /api/ledger/:id`
- `POST /api/admin/run-poc`
- `GET /api/admin/rules`
- `POST /api/admin/rules`
- `PATCH /api/admin/rules/:ruleKey`
- `POST /api/admin/rules/dry-run`
- `POST /api/admin/backfill/rescore`
- `GET /api/admin/guardrails/failures`

Important contract notes:

- The public read API is based on precomputed snapshots, not request-time scoring.
- Engine-scoped state APIs (currently `GET /api/v1/energy/state`) are backed by precomputed `scores` rows, not request-time scoring.
- Rule-based mismatch adjustments are evaluated during scoring runs from active `rules` rows for `oil_shock`.
- Guardrail flags for stale/missing dimensions and missing feeds are attached to snapshots as `guardrailFlags`.
- `GET /health` includes `featureFlags.macroSignals` so operators can verify active runtime mode selection.
- `POST /api/admin/run-poc` triggers collection and scoring asynchronously.
- If routes change, update this document, any frontend consumers, and tests in the same change set where practical.

## Data model overview

Key tables and responsibilities:

- `series_points`: normalised source observations
- `signal_snapshots`: scored snapshots served by the API
- `run_evidence`: evidence rows attached to scoring runs
- `runs`: collection and score run tracking
- `state_change_events`: state transition history for clocks and dwell logic
- `config_thresholds`: runtime scoring constants and gates
- `seasonal_baselines`: per-period (ISO week / month) 5-year baselines for physical-supply feeds
- `impairment_ledger`: manual score adjustments
- `feed_registry`: macro feed metadata and enablement state (bridge currently wired for Energy feed keys only)
- `feed_checks`: per-feed collection and save checks used for feed-health reporting
- `observations`: macro bridge observation store (currently dual-written from Energy collection)
- `rule_state`: persistent Rule Engine v2 lifecycle state (currently Energy bridge rules)
- `trigger_events`: idempotent Rule Engine v2 transition events (currently Energy bridge rules)
- `action_log`: Action Manager decision log (currently Energy logging-only bridge decisions)

## Macro Signals bridge runtime (current)

The runtime remains bridge-shaped rather than full registry-driven orchestration:

- Energy collection writes its normalized points to `series_points` and dual-writes them to `observations`.
- Each successful Energy score also writes an Oil Shock compatibility snapshot and evidence rows so the existing `/api/state`, `/api/evidence`, and frontend contracts remain live during the bridge.
- Energy observation/feed-check writes consult `feed_registry` enabled rows when Energy registry rows exist.
- If `feed_registry` has no Energy rows, Energy observation writes fall back to writing all Energy points so local/dev environments without seed rows do not break.
- `GET /api/feed-health` is read-only and returns feed health derived from Energy `feed_registry` rows plus each feed's latest `feed_checks` entry.
- `GET /api/engines` lists active runtime-read engines (currently Energy only).
- `GET /api/engines/energy/runtime` is a read-only runtime inspection endpoint that returns the Energy runtime chain state for:
  - latest feed health (`feed_registry` + `feed_checks`)
  - latest `observations` rows; each row carries its stored fields (`feedKey`, `seriesKey`, `asOfDate`, `observedAt`, `value`, `unit`) plus presentation-friendly enrichment merged in by the route from the already-loaded `feed_registry` data: `displayName` (falls back to `feedKey`), `provider`, and `dimension` (the signal category — `physical_stress`, `energy_spread`, `price_signal`, or `other` — derived from the feed-key prefix via `categoryForFeedKey`). The enrichment is read-only presentation metadata and does not change scoring inputs.
  - current `rule_state` rows
  - recent `trigger_events`
  - recent `action_log` decisions including guardrail rationale in `details`
- Energy scoring now invokes a bridge Rule Engine v2 lifecycle after the existing legacy `scores` write. The v2 lifecycle reads Energy `observations`, evaluates typed Energy rules, persists `rule_state`, and inserts idempotent `trigger_events` for state transitions.
- After successful Energy Rule Engine v2 transitions, a logging-only Action Manager bridge reads confirmed Energy `trigger_events`, evaluates Guardrail Policy v1, and writes idempotent `action_log` decisions using deterministic decision keys (duplicate decision keys are evaluated and skipped from writes).

Current limitation:

- Only Energy is wired into this bridge path.
- CPI and macro release collection remain disabled in runtime collection flow.
- Action Manager is logging-only and does not execute trades, notifications, allocations, or live guardrail enforcement.
- Guardrail Policy v1 is Energy-only and logging-only; supported Energy triggers still resolve to `decision = "ignored"` because no execution policy is configured.
- Runtime read endpoints are read-only diagnostics; they do not trigger collection, scoring, guardrail execution, or action execution.

## Scoring and state model

There are two distinct scores. Do not conflate them.

1. **Live Energy score** — served by `GET /api/v1/energy/state`, written to the `scores` table by
   `runEnergyScore` in `worker/src/jobs/score.ts`. This is what the live frontend reads. See
   [Energy scoring model (live path)](#energy-scoring-model-live-path) below.
2. **Oil Shock compatibility snapshot** — served by `GET /api/state`, written to
   `signal_snapshots` by `worker/src/jobs/score-compatibility.ts` and
   `worker/src/core/scoring/compute.ts`. This is the legacy recognition-gap model described in this
   "Scoring and state model" section.

### Energy scoring model (live path)

Thesis: **physical energy stress is worsening faster than market pricing recognises.** The live
score therefore measures the *unrecognised* portion of physical stress, separating three
explicitly-defined dimensions:

- `physicalStress` (← `energy_spread.wti_brent_spread` + `physical_stress.*.seasonal_breach`) —
  physical crude constraint: the anchored WTI-Brent basis plus a per-feed seasonal-baseline penalty.
- `marketRecognition` (← `1 - price_signal.curve_slope`, `null` when missing) — how much pricing
  already reflects the stress. Inverted so **backwardation raises** recognition.
- `transmissionStress` (← `energy_spread.diesel_wti_crack`) — bounded downstream/product stress.

```text
physicalStress = clamp01(basisStress + physical_baseline_penalty_weight * seasonalBreachCount)

hiddenMismatch = physicalStress^2 * (1 - marketRecognition)   // physicalStress^2 * 0.5 when recognition is missing

scoreValue = clamp01(
  hiddenMismatch
  + transmissionStress * mismatch_market_response_weight
  + ruleAdjustment
)
```

`physicalStress` enters the mismatch **quadratically** so risk accelerates toward genuine shortage.
The WTI-Brent basis and diesel crack are normalised against USD/bbl anchors from `config_thresholds`
(`wti_brent_floor_usd`/`wti_brent_ceiling_usd`, `diesel_crack_floor_usd`/`diesel_crack_ceiling_usd`),
with a `wti_premium_discount` applied when WTI trades above Brent. Each physical-supply feed
(`physical_stress.inventory_draw`, `refinery_utilization`, `eu_gas_storage`) that falls below its
5-year seasonal baseline (persisted in the `seasonal_baselines` table) adds
`physical_baseline_penalty_weight` to physical stress.

A missing `marketRecognition` is treated as **unknown**: it adds the `missing_price_confirmation`
flag and lowers confidence to `0.6`, and it is fed into the compatibility path as a neutral `0.5`
(not `0`). It does **not** confirm the thesis. `transmissionStress` is bounded by
`mismatch_market_response_weight` so it can never drive the score on its own. Full detail, scenario
examples, the seasonal-baseline mechanics, and known risks are in
[`scoring-model.md`](./scoring-model.md).

### Oil Shock compatibility snapshot

The legacy snapshot works across three dimensions:

- `physicalStress`
- `priceSignal`
- `marketResponse`

The compatibility mismatch score is:

```text
mismatchScore = clamp01(
  physicalStress
  - priceSignal
  + marketResponse * mismatch_market_response_weight
)
```

The compatibility **formula is unchanged**, but it consumes the live Energy score's derived inputs,
so the Energy refactor deliberately shifts its output: `physicalStress` carries the seasonal-baseline
penalty, and `priceSignal` is the **inverted** recognition (`1 - curve_slope`). Backwardation now
lowers the compatibility mismatch (consistent with the live score treating it as recognition).
`replay:validate` injects these inputs directly, so it does not exercise this change.

Coverage is tracked separately:

```text
coverageConfidence = clamp01(
  1
  - missingDimensions * coverage_missing_penalty
  - staleDimensions * coverage_stale_penalty
)
```

The regime classification is `aligned`, `mild_divergence`, `persistent_divergence`, or `deep_divergence`.

Important invariants:

- A `null` dwell duration must not jump directly to persistent or deep divergence.
- Confirmation gates matter. High mismatch alone is not enough for persistent or deep divergence.
- Stale critical data conservatively downgrades the state to `aligned`.
- API consumers should treat the snapshot as the source of truth, not reimplement scoring client-side.

## Evidence and ledger logic

Evidence is written per scoring run and classified against the dislocation thesis.

In broad terms:

- high `physicalStress` supports the thesis
- low `priceSignal` while `physicalStress` is high supports the recognition-gap thesis
- high `marketResponse` supports downstream recognition

Manual ledger entries can push the score up or down after the base score is computed. Default behaviour is additive and bounded, and stale or retired ledger entries should not affect active scoring.

## Registry Tables

Two feed registry tables exist with distinct purposes. Do not conflate them.

### `api_feed_registry` (legacy API health monitoring)

Lives in `db/migrations/0015_api_health_tracking.sql` and `0016_add_diesel_crack_feed.sql`.
Read by `getFeedRegistry()` in `worker/src/lib/api-instrumentation.ts` and by the
`/api/admin/api-health` endpoint.

Purpose: track per-request health metrics for every `instrumentedFetch()` call and surface
feed status for operational monitoring.

**Active feeds** (have collectors, record to `api_health_metrics`):

| feed_name | Collector | Series written |
|---|---|---|
| `eia_wti` | `collectors/energy.ts` | `energy_spread.wti_brent_spread` (input) |
| `eia_brent` | `collectors/energy.ts` | `energy_spread.wti_brent_spread` (input) |
| `eia_diesel_wti_crack` | `collectors/energy.ts` | `energy_spread.diesel_wti_crack` |
| `eia_futures_curve` | `collectors/eia-futures-curve.ts` | `price_signal.curve_slope` |
| `eia_refinery` | `collectors/eia-refinery.ts` | `physical_stress.refinery_utilization` |
| `eia_inventory` | `collectors/eia-inventory.ts` | `physical_stress.inventory_draw` |
| `gie_storage` | `collectors/gie.ts` | `physical_stress.eu_gas_storage` |

**Disabled feeds** (no collectors exist; disabled in migration `0020`, not re-enabled):

| feed_name | Provider | Notes |
|---|---|---|
| `enia_pipeline` | ENTSOG | No collector; requires separate API credentials |
| `sec_impairment` | SEC EDGAR | No collector; requires separate API credentials |

### `feed_registry` (Macro Signals engine registry)

Lives in `db/migrations/0017_macro_engine_core.sql`. Seeded by migrations `0018` (Energy),
`0019` (CPI, disabled), `0021` (GIE storage), `0022` (EIA refinery), and `0023` (EIA inventory
and futures curve). Read by `listEnabledFeedKeys()` and related functions in
`worker/src/db/macro.ts`.

Purpose: manage which engine/feed pairs are active for the Macro Signals bridge path —
controls `observations`, `feed_checks`, and runtime engine listing.

These two tables serve different subsystems and do not need to stay in sync.

## Data Sources and API Endpoints

All collectors live in `worker/src/jobs/collectors/`. Each emitted point is namespaced under exactly one dimension: `price_signal.*`, `physical_stress.*`, or `market_response.*`.

### EIA (active)

- Base API: `https://api.eia.gov/v2/`
- Auth: `EIA_API_KEY`
- Currently active: WTI/Brent spot prices, diesel-WTI crack spread, refinery utilisation, crude inventory draw, and futures curve slope
- Used for WTI spot, crude inventory draw, futures curve slope, refinery utilisation, and crack spread inputs
- Stage 4 energy collector also uses EIA spot series for WTI/Brent spread and Gulf Coast ULSD-vs-WTI crack inputs (`energy_spread.*`). The diesel price is converted from dollars per gallon to dollars per barrel before subtracting WTI.
- The scheduled Energy collector now also polls monthly refinery utilisation (`physical_stress.refinery_utilization`), normalizes it as stress with `1 - utilization / 100`, and dual-writes it to `observations`
- The scheduled Energy collector now also polls weekly crude inventory (`physical_stress.inventory_draw`) and normalizes it as a 52-week inverse inventory position
- The scheduled Energy collector now also polls the public EIA crude futures curve proxy (`price_signal.curve_slope`) using the front and fourth contracts exposed by the API, normalizing the spread as a 0-1 contango ratio
- Uses a rolling 45-day window for spot series
- Daily series use a rolling 60-day window
- Weekly series use a rolling 26-week window
- Monthly refinery utilisation uses a rolling upstream window large enough to catch the latest published month and prefers upstream `period` values for `observedAt`
- Do not hardcode collection windows
- Historical backfills for the live Energy bridge are available via `scripts/backfill-eia-energy.ts`, `scripts/backfill-eia-inventory.ts`, `scripts/backfill-eia-futures-curve.ts`, and `scripts/backfill-eia-refinery.ts`; they pull the upstream EIA series over a date range and dual-write the derived points into `series_points` and `observations`

### ENTSOG (aspirational — not yet implemented)

- ENTSOG: pipeline operational data for `physical_stress.eu_pipeline_flow`; requires separate API credentials; no collector exists

### GIE AGSI+ (active)

- Base API: `https://agsi.gie.eu/api`
- Collector: `collectors/gie.ts`; gated by `physical_stress.eu_gas_storage` in `feed_registry`
- Polls EU aggregate storage daily and dual-writes `physical_stress.eu_gas_storage` as stress (`1 - full / 100`)
- Prefer upstream timestamps such as `gasDayStart`; missing values remain missing rather than defaulting to synthetic neutral values
- Historical backfill via `scripts/backfill-gie-storage.ts`

### SEC EDGAR (aspirational — not yet implemented)

- Intended for `market_response.sec_impairment`
- Requires a compliant `User-Agent`
- Filing lag is real and can make low scores legitimate rather than erroneous
- Prefer upstream `filingDate` for `observedAt`
- Collector failure should degrade confidence rather than silently fabricate a fallback signal

## Freshness and determinism

Current freshness windows are:

- `physicalStress`: 8 days
- `priceSignal`: 3 days
- `marketResponse`: 8 days

Important rules:

- Prefer upstream observation timestamps over ingestion time
- Keep freshness handling explicit for fresh, stale, and missing states
- If scoring logic changes, run `corepack pnpm replay:validate`
- If docs or contracts change, run `corepack pnpm docs:check`

## Configurable Thresholds

All scoring constants belong in `config_thresholds`.

Operational rules:

- Do not hardcode thresholds, weights, penalties, or dwell windows in code.
- Change seeded values through additive migrations, not by editing already-applied migrations.
- Keep code, migrations, tests, and docs aligned.

Current seed groups are split across:

- `db/migrations/0004_config_thresholds.sql`
- `db/migrations/0006_promote_scoring_constants.sql`
- `db/migrations/0008_complete_config_thresholds.sql`
- `db/migrations/0025_energy_score_refactor_thresholds.sql` — Energy refactor constants:
  `wti_brent_floor_usd`, `wti_brent_ceiling_usd`, `wti_premium_discount`, `diesel_crack_floor_usd`,
  `diesel_crack_ceiling_usd`, `physical_baseline_penalty_weight`, `seasonal_baseline_years`,
  `physical_rolling_weeks`.

Important nuance:

- The runtime loader (`loadThresholds`) requires every key in `THRESHOLD_KEY_MAP` at startup and
  throws `MISSING_THRESHOLD` otherwise. Adding a key means seeding it via migration **and** updating
  every `ScoringThresholds` fixture in the test suite.
- Document row count and runtime-required keys separately to avoid false assumptions when debugging startup failures.

## Documentation maintenance

Update this document when any of the following change materially:

- API routes or contracts
- scoring formulas or gating rules
- collector behaviour, timestamps, or source mappings
- freshness handling
- threshold storage or migration workflow
- ledger adjustment behaviour

This document is the durable home for implementation detail that is too volatile or too long for `AGENTS.md` or `CLAUDE.md`.


## CPI collect-only bridge (registry-gated)

A CPI collect-only bridge now exists for Macro Signals validation.

- Collector: `worker/src/jobs/collectors/cpi.ts`
- Feed key: `macro_release.us_cpi.all_items_index`
- Engine key: `cpi`
- Registry seed: `db/migrations/0019_seed_cpi_feed_registry.sql`

Current behaviour:

- CPI feed collection is gated by `feed_registry` enablement for `engine_key='cpi'`.
- CPI registry rows are seeded disabled by default (`enabled=0`).
- When CPI is enabled, the collector parses a fixture response and writes to `observations` plus `feed_checks`.
- CPI writes are idempotent through the existing `observations` unique key and upsert path.
- CPI bridge scope currently stops at collect/observation/feed-check; it does **not** write `rule_state`, `trigger_events`, guardrail decisions, or `action_log`.
- Energy runtime chain and endpoints remain unchanged (`GET /api/engines` and `GET /api/engines/energy/runtime` stay Energy-first).
