# Current Priorities

This document captures the current sequencing and decision constraints for work in this repository.

## Current status

- **Macro Signals bridge slice (April 2026): Energy registry-backed feed execution + feed health route** — ✅ COMPLETE
  - Energy continues bridge dual-write: legacy `series_points` plus macro `observations`
  - Energy observation/feed-check bridge writes are now filtered by enabled `feed_registry` rows when Energy registry rows exist
  - `/api/feed-health` now reports read-only feed health from `feed_registry` + latest `feed_checks`
  - Fallback remains in place: when no Energy registry rows exist, Energy observation writes still include all Energy points
  - CPI and macro release collection remain disabled
- **Macro Signals bridge slice (April 2026): Energy Rule Engine v2 lifecycle** — ✅ COMPLETE
  - Energy scoring now runs a typed Rule Engine v2 lifecycle bridge after the existing legacy Energy score write
  - The bridge reads Energy `observations`, persists rule lifecycle state in `rule_state`, and inserts idempotent transition rows in `trigger_events`
  - Existing `/api/v1/energy/state` and legacy score storage paths remain compatible
  - CPI and macro release collection remain disabled
- **Macro Signals bridge slice (April 2026): Energy Action Manager logging bridge** — ✅ COMPLETE
  - Energy scoring now invokes an Action Manager bridge after successful legacy scoring and successful Energy Rule Engine v2 lifecycle transitions
  - The bridge reads confirmed Energy `trigger_events`, evaluates Guardrail Policy v1, and writes idempotent decisions into `action_log` (duplicate decision keys are evaluated and skipped from writes)
  - Decisions are explicitly logging-only (`action_type=log_only`); no trades, notifications, allocation changes, or live guardrail enforcement are executed
  - Decisions now pass through Guardrail Policy v1 (Energy-only, logging-only) before `action_log` writes; supported Energy triggers remain `decision="ignored"` because no execution policy exists
  - CPI and macro release collection remain disabled
- **Macro Signals bridge slice (April 2026): Engine Runtime Read API v1 (Energy-first)** — ✅ COMPLETE
- **Macro Signals bridge slice (April 2026): CPI collect-only bridge** — ✅ COMPLETE
  - CPI feed is seeded in `feed_registry` as `macro_release.us_cpi.all_items_index`
  - CPI registry row is disabled by default (`enabled=0`) and collection is registry-gated
  - When enabled, CPI fixture parsing writes collect-only `observations` and `feed_checks`
  - CPI bridge does not write `rule_state`, `trigger_events`, guardrail decisions, or `action_log`
  - Runtime listing remains Energy-only until a dedicated CPI runtime visibility slice lands

  - Added read-only runtime inspection endpoints: `GET /api/engines` and `GET /api/engines/energy/runtime`
  - Runtime response exposes Energy chain state in stable JSON: `feedHealth`, `observations`, `ruleState`, `triggerEvents`, and `actions`
  - `actions[].details` includes stored guardrail rationale when present in `action_log.details_json`
  - Endpoints are read-only diagnostics; no mutation, execution, notification, allocation, or rollout behavior changed
  - CPI remains disabled and is not listed as an active runtime engine
- **Phase 6A (Energy Engine) pre-canary readiness validation** — Blocked at evidence collection
  - Infrastructure complete: Gate system, validation tests, rollout controls, API health tracking all merged to main
  - **CURRENT PHASE**: Pre-canary readiness validation (evidence collection)
  - **10% CANARY BLOCKED**: See "Immediate blocker" below
  - **Reason**: Preview endpoint reliability instability. Required endpoints intermittently return HTTP 503 `DNS cache overflow`, preventing formal evidence capture completion
  - Phase 1 (Days 22-26): Internal canary at 10% — **will not start until blocker resolved**
  - Phase 2 (Days 27-35): Public expansion 50%
  - Phase 3 (Days 36-42): Full rollout 100%
  - Phase 4 (Days 43-52): Stabilization monitoring
- **Phase 6B (Macro Releases) readiness complete, implementation deferred to Q3 2026**
  - ✅ BLS CPI parser and fixtures ready (disabled-by-default)
  - ⏳ Implementation waits for: Phase 6A stability (4+ weeks) + CPI history (8-12 weeks)
  - See: `docs/phase-6b-macro-releases.md`, `docs/phase-6b-bls-cpi-readiness-task.md`
- The repo currently implements Oil Shock (archived) + Energy engine (active, being rolled out)
- `main` is the canonical branch and the implementation source of truth

## Phase 6A (May 2026): Energy Engine Validation and Rollout

**Timeline**: 3-4 weeks (Days 1-28)
**Owner**: Energy + Platform teams

### Phase 6A Work Streams

**Stream 1: Gate Infrastructure and Validation (Days 4-21)** — ✅ COMPLETE

- [x] Days 4-7: Implement `/api/admin/gate-status` endpoint (enforced pre-deploy gates)
- [x] Days 4-7: Update `/api/health` with `runtimeMode` and `degradedComponents` fields
- [x] Days 8-14: Implement energy determinism and data freshness tests
- [x] Days 8-14: Implement `/api/admin/rules-compare` endpoint (rule consistency validation)
- [x] Days 15-21: Implement per-component error tracking and graceful degradation
- [x] **Code Review & Fixes**: Comprehensive review identified 11 issues, all fixed and merged

**Stream 2: Feature Flags and Monitoring (Days 8-21)** — ✅ COMPLETE

- [x] Add `ENERGY_ROLLOUT_PERCENT` feature flag (0-100 traffic split)
- [x] Implement `/api/admin/rollout-status` endpoint
- [x] Implement `/api/admin/validation-status` endpoint
- [x] Implement `/api/admin/api-health` endpoint (per-feed monitoring)
- [x] Create API health tracking (D1 schema + Grafana dashboard)

**Stream 3: Production Rollout (Days 22-52)** — 🔴 BLOCKED AT EVIDENCE COLLECTION

Preparation Phase (Before Day 22):

**Step -1: D1 Target Preflight** — ✅ COMPLETE
- [x] **TOOL-COMPLETE**: D1 target preflight guardrail implemented
- [x] **TOOL-COMPLETE**: Detects unsafe D1 ID sharing patterns (preview-production critical, root sharing warnings)
- [x] **TOOL-COMPLETE**: Validates required migration files exist
- [x] **TOOL-COMPLETE**: Generates Markdown preflight report with Cloudflare D1 commands
- [x] **OPERATOR-ACTION**: Migrations 0014, 0015, 0016 applied to preview database
- [x] **PREVIEW SEPARATION**: Preview and production D1 databases separated and verified
- [x] Reference: `docs/evidence/phase6a-d1-target-preflight.md`

**Step 0: Telemetry Setup** — ✅ CODE-COMPLETE, ✅ LIVE-VERIFIED (feeds healthy)
- [x] **CODE-COMPLETE**: Wire energy collector to use `instrumentedFetch()` (merged to main, PR #???)
- [x] **CODE-COMPLETE**: D1 schema and API health endpoints implemented
- [x] **LIVE-VERIFY**: D1 migrations 0014/0015/0016 applied and verified
- [x] **LIVE-VERIFY**: Staging collection confirms metrics recorded to `api_health_metrics`
- [x] **LIVE-VERIFY**: `/api/admin/api-health` returns live data in staging: 3 Energy feeds healthy (0% error rate)
- [x] **LIVE-VERIFY**: Telemetry flowing in staging environment (EIA feeds responding)
- [x] Reference: `docs/TELEMETRY_SETUP_GUIDE.md`, `docs/evidence/phase6a-staging-telemetry-verification.md`

**Step 1: Grafana Monitoring Setup** — ⏳ DEFERRED (not immediate blocker for canary)
- [ ] Import Grafana dashboard (`docs/grafana-api-health-dashboard.json`)
- [ ] Configure 5 Grafana alert rules (`docs/grafana-api-health-alerts.md`)
- [ ] Test dashboard queries against live D1 data
- [ ] Verify alert routing (Slack, PagerDuty)
- [ ] **Status**: Deferred to post-canary stabilization phase. Required before broader expansion and operational maturity, but not blocking 10% canary start
- [ ] Reference: `docs/GRAFANA_SETUP_GUIDE.md`

**Step 2: Evidence Capture & Readiness Report** — 🔴 BLOCKED (see immediate blocker below)
- [x] Phase 6A evidence capture tool implemented and tested (PR #86 fixed formatter safety)
- [ ] Run Phase 6A evidence capture tool to verify all prerequisites
  - `corepack pnpm phase6a:evidence -- --base-url https://staging-worker.example.com`
  - **CURRENT STATUS**: Report is INCOMPLETE due to endpoint failures
  - **BLOCKER**: Required endpoints intermittently return HTTP 503 `DNS cache overflow`
  - Must resolve endpoint reliability before evidence can be READY
  - Reference: `docs/phase-6a-canary-evidence-capture.md`, `docs/evidence/phase6a-readiness-index.md`

**Step 3: Team Communication & Procedures** — ⏳ WAITING FOR STEP 2
- [ ] Team notification of readiness (deferred until Step 2 complete)
- [ ] Create incident response runbook (rollback procedures, root cause investigation)
- [ ] Rehearse rollback procedure (ENERGY_ROLLOUT_PERCENT=0)

### Immediate Blocker: Preview Endpoint Reliability

**Current Status**: 🔴 BLOCKED — Evidence collection is incomplete

**Root Cause**: Preview endpoints intermittently return HTTP 503 with non-JSON response body: `"DNS cache overflow"`

**Affected Endpoints**:
- `/health` — HTTP 503 `DNS cache overflow`
- `/api/admin/rollout-readiness` — HTTP 503 `DNS cache overflow`
- `/api/admin/rollout-status` — HTTP 503 `DNS cache overflow`
- `/api/admin/api-health` — HTTP 200 ✅ (operational)

**Evidence Capture Requirement** (PR #86 fix):
- All required endpoints must return HTTP 200 with valid JSON
- Any HTTP 503 or non-JSON response automatically marks evidence INCOMPLETE
- Manual probing or "mostly OK" observations do not override formal evidence capture requirement
- **Manual verification is not sufficient for canary approval** — evidence capture must succeed

**What Must Be Resolved Before Canary**:
1. Stabilize or diagnose preview endpoint reliability
2. Eliminate HTTP 503 `DNS cache overflow` errors from required endpoints
3. Rerun evidence capture until status is READY or acceptable WARNING
4. Confirm evidence report is internally consistent and all feeds healthy
5. No endpoint failures during capture window

**Next Steps**:
- **Step A (Immediate)**: Stabilise/diagnose preview endpoint reliability (infrastructure investigation)
- **Step B**: Rerun evidence capture with stable endpoints
- **Step C**: Rollback rehearsal in staging
- **Step D**: Team communication and schedule coordination
- **Step E**: Accountable owner review of all sign-offs
- **Step F**: 10% canary deployment (only after all previous steps complete)

### Execution Phase (Blocked Until Blocker Resolved)

**Canary Remains Blocked Until**:
- [x] D1 preview/production separation complete
- [x] Telemetry flowing and feeds healthy
- [x] Evidence capture tool safety fixed (PR #86)
- [x] Canonical Worker naming fixed (PR #85)
- [x] Vercel preview routing to canonical preview Worker verified
- [ ] **Fresh evidence report is READY or acceptable WARNING** (currently INCOMPLETE)
- [ ] **All required endpoints stable (HTTP 200, valid JSON)** (currently intermittent HTTP 503)
- [ ] Rollback rehearsal complete
- [ ] Team communication sent
- [ ] Accountable owner review recorded

**Timeline After Blocker Resolved**:
- Week 1 (Days 22-26): Internal canary at 10% (5-day monitoring)
  - Day 22: Deploy ENERGY_ROLLOUT_PERCENT=10, verify canary setup
  - Days 23-26: Execute daily monitoring checklist
- Week 2 (Days 27-35): Public expansion 50%
  - Day 27: Increase to ENERGY_ROLLOUT_PERCENT=50
  - Days 28-35: Monitor 50/50 split, compare metrics
- Week 3 (Days 36-42): Full rollout 100%
  - Day 36: Increase to ENERGY_ROLLOUT_PERCENT=100
  - Days 37-42: Monitor for regressions
- Week 4 (Days 43-52): Stabilization
  - Days 43-52: Long-term stability monitoring, prepare Phase 6B

### Pre-Phase-6A: Documentation (COMPLETE)

- [x] Phase 6A/6B planning docs (8 documents created)
- [x] Validation strategy clarified (engine-independent, not snapshot comparison)
- [x] Pre-deploy gate system design documented
- [x] Failure handling per component documented
- [x] Rollout strategy (0% → 100%) documented
- [x] Rollback procedures documented
- [x] Implementation plan updated (main docs)
- [x] Evidence capture tool implemented (PR #86: formatter safety fixed)
- [x] Canonical Worker naming fixed (PR #85: explicit preview/production targeting)

See: `/docs/phase-6a-energy.md`, `/docs/validation-strategy.md`, `/docs/pre-deploy-gates.md`, `/docs/energy-rollout-strategy.md`, `/docs/failure-handling.md`, `/docs/phase-6-rollback-procedures.md`, `/docs/phase-6b-macro-releases.md`, `docs/evidence/phase6a-readiness-index.md`

### Deferred Items (Not Blocking Canary)

**Grafana Dashboard & Alerts**:
- **Status**: Deferred to post-canary stabilization phase (after Days 22-26)
- **Reason**: Not required for 10% canary readiness; required before broader expansion to 50%+ and for operational monitoring maturity
- **Reference**: `docs/GRAFANA_SETUP_GUIDE.md`, `docs/grafana-api-health-dashboard.json`, `docs/grafana-api-health-alerts.md`
- **Timeline**: Implement after internal canary validates stability (post-Day 26)

## Immediate priorities

### 1. Preserve the current Oil Shock path

Keep collection, scoring, snapshot writing, and the current API surface working while making changes. The existing path should remain operational during transition unless a task explicitly says to replace it.

### 2. Stage Macro Signals changes, do not jump there conceptually

Prefer additive, foundational changes over large rewrites that assume a finished multi-engine design. Build the bridge before crossing it.

Near-term follow-up after Rule Engine v2 bridge completion:

- Introduce generic engine-scoped APIs when backend contracts are stable enough to expose consistently, or
- Add collect-only CPI bridge after Energy Guardrail Policy v1 stability evidence is captured.

Near-term follow-up after runtime-read API v1:

- Harden CPI runtime visibility and diagnostics now that CPI collect-only bridge evidence exists, or
- Add CPI Rule Engine skeleton only after collect-only evidence remains stable, or
- Harden runtime-read contracts (pagination, retention, and engine registry growth) before generic multi-engine API rollout.

### 3. Keep durable context in the repo

If an instruction, rule, or design constraint should guide future work, put it in repository docs rather than leaving it only in chat or project memory.

### 4. Keep documentation and implementation in sync

When routes, formulas, thresholds, collector behaviour, or UI contracts change, update the relevant docs in the same change set where practical.

### 5. Match validation to blast radius

Run the closest appropriate checks for the change. Scoring and migration work need stronger validation than isolated UI tweaks.

## Working assumptions

- The API should remain snapshot-based rather than computing heavy scoring work at request time.
- `config_thresholds` remains the source of truth for runtime scoring constants.
- Missing and stale data handling should remain explicit and conservative.
- Frontend changes should stay aligned with backend contracts.
- Schema work should prefer additive migrations before destructive clean-up.

## Recommended order for Macro Signals work

1. Move durable context into repo docs first.
2. Introduce shared abstractions behind the current Oil Shock path.
3. Add additive schema and configuration changes.
4. Introduce engine-scoped logic only when compatibility is preserved or intentionally replaced.
5. Retire old structures only after tests, docs, and consumers are updated.

## Current risks to watch

- Route and contract drift between Worker and app
- Docs drifting from the codebase
- Hardcoded scoring constants slipping back into code
- Refactors that assume multi-engine support exists before the data model and runtime support are ready
- Migration changes that update schema without updating dependent queries, types, and tests

## Documentation checklist

Update these files when relevant:

- `README.md`: top-level orientation and entry points
- `docs/architecture.md`: current implemented architecture and detailed behaviour
- `docs/current-priorities.md`: current sequencing, transition constraints, and non-goals
- `AGENTS.md`: durable agent operating rules
- `CLAUDE.md`: durable Claude-specific operating rules

## Change checklist

Before finishing a non-trivial change, check:

- Is the implementation still aligned with the current Oil Shock path?
- Did the work avoid assuming target-state Macro Signals structures already exist?
- Are code, tests, migrations, frontend contracts, and docs consistent?
- Were the right validation commands run for the blast radius?
