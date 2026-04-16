---
spec: "oil-shock-mvp"
phase: research
created: "2026-04-16"
---

# Research: oil-shock-mvp

## Executive Summary

The MVP is feasible as a low-cost "energy dislocation state engine" using public data sources, with Cloudflare Workers + D1 for backend execution/storage and Vercel for frontend delivery. The core system should score physical constraint pressure against market recognition and emit conservative actionability states (`none`, `watch`, `actionable`). A phased implementation with strict data-lag handling and confidence gates is the safest way to ship useful early signals without paid data.

## External Research

### Best Practices
- Use revision-aware physical indicators (inventories, utilization, implied demand) and keep release-time metadata explicit.
- Separate "physical constraint pressure" from "market recognition" into distinct feature groups and scoring passes.
- Prefer transparent rule-based scoring in v1, with post-hoc tuning based on observed false positives/negatives.
- Use precomputed snapshots for API reads; do not compute expensive scoring logic on user requests.

### Prior Art
- Public oil market monitoring commonly combines EIA weekly stock and product signals with futures structure and crack behavior.
- Operational market-intel tools typically pair a balance/constraint layer with a "market has/has not repriced" layer.
- Your existing Cloudflare + Vercel plan is aligned with low-ops deployment patterns for early-stage data products.

### Pitfalls to Avoid
- Treating lagged monthly series as same-day observations.
- Triggering from a single metric spike without cross-confirmation.
- Growing schema/scope too fast before replay validation stabilizes thresholds.
- Storing large raw documents in D1 rather than metadata/excerpts.

## Codebase Analysis

### Existing Patterns
- Current repository is minimal and contains only [README.md](C:/Projects/oil-shock/README.md).
- No existing ingestion, modeling, scheduling, or alerting code patterns are present yet.

### Dependencies
- Existing dependencies: none.
- Recommended MVP dependencies:
  - TypeScript worker runtime with `wrangler`.
  - D1 migrations and query tooling via Wrangler.
  - Frontend stack: Vite + React (lean) or Next.js (if server-side features become necessary).
  - Testing: unit tests for scoring primitives and fixture replay checks.

### Constraints
- Budget-first requirement implies public data first; no paid vendors in v1.
- Must support mixed cadence (daily market inputs, weekly physical updates, monthly context data).
- Operational simplicity matters: low-cost hosting, low-touch scheduling, explicit runbooks.
- Browser-side app cannot expose backend secrets; all protected logic stays in Worker.

## Architecture Direction (From Existing Plan)

### Runtime and Hosting
- Cloudflare Workers for API endpoints, scheduled collectors/scoring, and orchestration.
- Cloudflare D1 for low-volume relational storage and signal snapshots.
- Vercel for frontend hosting with preview deploys from branch pushes.

### Initial API Surface
- `GET /api/state`
- `GET /api/evidence`
- `GET /api/coverage`
- `GET /api/ledger/review`
- `POST /api/ledger`
- `PATCH /api/ledger/:id`

### Data Model Priorities
- Start with narrow, auditable tables: `series_points`, `signal_snapshots`, `runs`, `run_evidence`, and ledger/review tables.
- Index time-series by `(series_key, observed_at)`.
- Keep raw large documents out of D1; store parsed metadata and evidence excerpts only.

### Delivery Phasing
- Phase 0-1: vendor/tooling setup, Worker scaffold, D1 setup, migrations.
- Phase 2-4: schema, collectors, scheduled jobs, and stable read APIs.
- Phase 5-6: frontend on Vercel with preview/prod env separation and Worker integration.
- Phase 7-9: security headers/origin control, CI/CD, and runbooks.

## Related Specs

| Spec | Relevance | Relationship | May Need Update |
|------|-----------|--------------|-----------------|
| None currently | Low | First spec in repo | No |

### Coordination Notes
No cross-spec coordination is required at this stage.

## Feasibility Assessment

| Aspect | Assessment | Notes |
|--------|------------|-------|
| Technical Viability | High | Architecture and tooling are standard and fit the MVP constraint profile. |
| Effort Estimate | M | Can be delivered incrementally in phased backend then frontend slices. |
| Risk Level | Medium | Primary risk is signal quality under lag/noise rather than platform feasibility. |

## Recommendations for Requirements

1. Lock MVP contract to one scored snapshot output containing `mismatch_score`, `actionability_state`, freshness metadata, and evidence pointers.
2. Require cross-confirmation before `actionable` (for example: physical stress + market under-recognition + transmission evidence).
3. Specify Cloudflare/Vercel environment separation (preview/production) and CORS/origin policy as first-class requirements.
4. Require migration-driven schema changes and deterministic replay tests before enabling automated deploy.
5. Keep sources public for v1, but define adapter interfaces for future paid data upgrades.

## Open Questions

- Geography: US-first vs global-first for the initial scoring domain.
- Recognition proxy set for v1: Brent only, Brent+WTI, or include product/freight proxies immediately.
- Alert channel for MVP: dashboard-only, webhook, email, or all three.
- Frontend scope for v1: read-only analyst dashboard vs full ledger editing UX.

## Verification Tooling Notes

- Unit tests for transforms, release-lag guards, and score combiners.
- Fixture-based replay suite for known stress windows and false-positive accounting.
- Contract tests for API snapshot shape (`generated_at`, `source_freshness`, `coverage_confidence`).
- CI checks for migration validity, typecheck/lint, and scoring dry run.

## Sources

- [EIA Weekly Petroleum Status Report](https://www.eia.gov/petroleum/supply/weekly/index.php) - Weekly US supply/demand and stocks.
- [EIA WPSR Release Schedule](https://www.eia.gov/petroleum/supply/weekly/schedule.php) - Timing and holiday delays.
- [JODI-Oil Database Overview](https://www.jodidata.org/oil/database/overview.aspx) - Public monthly international oil data.
- [OPEC Monthly Oil Market Report](https://www.opec.org/monthly-oil-market-report.html) - Monthly market balance context.
- [IEA Oil Market Report Data Product](https://www.iea.org/data-and-statistics/data-product/oil-market-report-omr) - Benchmark subscription reference for possible later upgrade.
- [Your draft plan](C:/Users/caido/Downloads/energy_dislocation_plan_with_cloudflare_vercel.md) - Deployment and phased implementation blueprint for Cloudflare + Vercel.
