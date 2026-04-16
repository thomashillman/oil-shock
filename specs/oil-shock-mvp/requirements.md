# Requirements: Oil Shock MVP

## Goal

Build a low-cost system that detects when physical energy constraints are worsening faster than market pricing reflects, and emits an actionable mismatch state with supporting evidence. The MVP must run on public data and remain operationally simple to deploy and maintain.

## User Stories

### US-1: Read Current Dislocation State

**As a** discretionary macro/energy analyst  
**I want to** view the latest dislocation state and confidence  
**So that** I can quickly decide whether to monitor or act

**Acceptance Criteria:**
- AC-1.1: `GET /api/state` returns `mismatch_score`, `actionability_state`, `generated_at`, `source_freshness`, and `coverage_confidence`.
- AC-1.2: `actionability_state` is one of `none`, `watch`, `actionable`.
- AC-1.3: Responses are served from a precomputed snapshot, not on-demand full recomputation.

### US-2: Inspect Supporting Evidence

**As a** risk-aware analyst  
**I want to** inspect evidence behind the current state  
**So that** I can validate signal quality before making decisions

**Acceptance Criteria:**
- AC-2.1: `GET /api/evidence` returns grouped evidence for physical constraints, market recognition, and transmission indicators.
- AC-2.2: Each evidence record includes source identifier, observed timestamp, freshness status, and contribution direction.

### US-3: Maintain Impairment Ledger Entries

**As a** system maintainer  
**I want to** review and update ledger assumptions  
**So that** stale or invalid assumptions do not degrade signal quality

**Acceptance Criteria:**
- AC-3.1: `GET /api/ledger/review` returns entries due for review.
- AC-3.2: `POST /api/ledger` creates a ledger entry with required metadata and review cadence.
- AC-3.3: `PATCH /api/ledger/:id` supports edit/retire flows and updates audit metadata.

### US-4: Operate Across Preview and Production

**As a** developer/operator  
**I want to** deploy and test preview/prod environments independently  
**So that** production risk is reduced

**Acceptance Criteria:**
- AC-4.1: Cloudflare Worker has separate preview and production environments.
- AC-4.2: Vercel preview frontend targets preview Worker URL; production frontend targets production Worker URL.
- AC-4.3: CORS allows only local dev, preview, and production frontend origins.

## Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | Ingest public data sources on schedule and persist normalized points to D1. | High | Scheduled jobs run and write `runs` + `series_points` records with timestamps and source keys. |
| FR-2 | Compute `mismatch_score` and `actionability_state` from independent feature groups. | High | Scoring run writes one coherent `signal_snapshots` record with state and evidence links. |
| FR-3 | Require cross-confirmation before state can become `actionable`. | High | At least two independent confirmation groups are present and fresh in the scoring run. |
| FR-4 | Expose stable read APIs for state, evidence, and coverage. | High | `/api/state`, `/api/evidence`, `/api/coverage` return documented schema and HTTP 200 on valid requests. |
| FR-5 | Expose ledger review/write APIs for analyst maintenance. | Medium | `/api/ledger/review`, `POST /api/ledger`, `PATCH /api/ledger/:id` pass contract tests. |
| FR-6 | Track run-level diagnostics and reproducibility metadata. | Medium | Each run records data window, freshness checks, and score version in `runs`/`run_evidence`. |
| FR-7 | Frontend dashboard shows state, confidence, evidence, and freshness indicators. | Medium | Frontend renders data from API without exposing server secrets. |
| FR-8 | Support deterministic replay mode for historical validation windows. | Medium | Replay command reproduces snapshot output from stored fixtures with stable results. |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | Performance | `GET /api/state` p95 latency | <= 300 ms from edge cache miss path in normal load |
| NFR-2 | Reliability | Scheduled run success rate | >= 98% successful daily scheduled runs over 30 days |
| NFR-3 | Data Quality | Freshness policy adherence | 100% of snapshots include freshness flags for all required feature groups |
| NFR-4 | Security | Secret exposure | No backend secrets present in frontend bundle or public API response |
| NFR-5 | Maintainability | Migration discipline | 100% schema changes via versioned D1 migration files |

## Glossary

- **Constraint Pressure**: Composite view of physical tightness indicators (supply, inventories, utilization, logistics stress).
- **Market Recognition**: Degree to which prices/spreads/curves already reflect physical tightening.
- **Mismatch Score**: Numeric estimate of dislocation between physical constraint pressure and market recognition.
- **Actionability State**: Categorical decision output: `none`, `watch`, `actionable`.
- **Coverage Confidence**: Confidence based on source completeness, freshness, and cross-signal agreement.

## Out of Scope

- Paid data vendors and premium alternative datasets in v1.
- Autonomous trade execution or portfolio rebalancing actions.
- Large-document storage and full-text LLM extraction pipelines.
- Multi-region/global expansion beyond initial target data domain in v1.

## Dependencies

- Cloudflare account access with Workers + D1 enabled.
- Vercel project for frontend deployment and preview environments.
- Public upstream data endpoints (for example EIA and other selected official feeds).
- CI pipeline for lint, typecheck, tests, and replay checks.

## Success Criteria

- System emits a coherent daily/weekly snapshot with valid state, freshness, and evidence fields.
- Analysts can explain each state transition using stored evidence artifacts.
- Preview and production pipelines deploy independently with correct API routing.
- Replay tests detect at least one known historical stress window and quantify false positives.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data lag/revision creates misleading states | High | Enforce release-time metadata, freshness gating, and replay validation |
| Early thresholds overfit and create noise | High | Use conservative initial thresholds and track false positive/negative outcomes |
| Scope growth delays MVP delivery | Medium | Keep source count and API surface minimal until baseline validation is stable |
| Scheduler or ingestion instability reduces trust | Medium | Persist run diagnostics, alert on failed jobs, and support manual re-run |
