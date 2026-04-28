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
- `impairment_ledger`: manual score adjustments
- `feed_registry`: macro feed metadata and enablement state (bridge currently wired for Energy feed keys only)
- `feed_checks`: per-feed collection and save checks used for feed-health reporting
- `observations`: macro bridge observation store (currently dual-written from Energy collection)
- `rule_state`: persistent Rule Engine v2 lifecycle state (currently Energy bridge rules)
- `trigger_events`: idempotent Rule Engine v2 transition events (currently Energy bridge rules)
- `action_log`: Action Manager decision log (currently Energy logging-only bridge decisions)

## Macro Signals bridge runtime (current)

The runtime remains bridge-shaped rather than full registry-driven orchestration:

- Legacy collector writes to `series_points` still run and remain the source for existing Oil Shock scoring and snapshot routes.
- Energy collection dual-writes matching points into `observations`.
- Energy observation/feed-check writes consult `feed_registry` enabled rows when Energy registry rows exist.
- If `feed_registry` has no Energy rows, Energy observation writes fall back to writing all Energy points so local/dev environments without seed rows do not break.
- `GET /api/feed-health` is read-only and returns feed health derived from Energy `feed_registry` rows plus each feed's latest `feed_checks` entry.
- `GET /api/engines` lists active runtime-read engines (currently Energy only).
- `GET /api/engines/energy/runtime` is a read-only runtime inspection endpoint that returns the Energy runtime chain state for:
  - latest feed health (`feed_registry` + `feed_checks`)
  - latest `observations` rows
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

The scoring system works across three dimensions:

- `physicalStress`
- `priceSignal`
- `marketResponse`

The main score is:

```text
mismatchScore = clamp01(
  physicalStress
  - priceSignal
  + marketResponse * mismatch_market_response_weight
)
```

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

## Data Sources and API Endpoints

All collectors live in `worker/src/jobs/collectors/`. Each emitted point is namespaced under exactly one dimension: `price_signal.*`, `physical_stress.*`, or `market_response.*`.

### EIA

- Base API: `https://api.eia.gov/v2/`
- Auth: `EIA_API_KEY`
- Used for WTI spot, futures curve slope, crude inventory draw, refinery utilisation, and crack spread inputs
- Stage 4 energy collector also uses EIA spot series for WTI/Brent spread and diesel-vs-WTI crack inputs (`energy_spread.*`)
- Daily series use a rolling 60-day window
- Weekly series use a rolling 26-week window
- Do not hardcode collection windows
- Prefer upstream `period` values for `observedAt`

### ENTSOG and GIE AGSI+

- ENTSOG: pipeline operational data for `physical_stress.eu_pipeline_flow`
- GIE AGSI+: gas storage data for `physical_stress.eu_gas_storage`
- Prefer upstream timestamps such as `periodFrom` and `gasDayStart`
- Missing values should remain missing rather than defaulting to synthetic neutral values

### SEC EDGAR

- Used for `market_response.sec_impairment`
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

Important nuance:

- The table is seeded with 20 rows across those migrations.
- The runtime loader currently requires a subset of those seeded keys at startup.
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
