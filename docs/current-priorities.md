# Current Priorities

This document captures the current sequencing and decision constraints for work in this repository.

## Current status

- **Phase 6A (Energy Engine) execution phase (Days 22-52)** — May 2026, weeks 4-8
  - Infrastructure complete: Gate system, validation tests, rollout controls, API health tracking all merged to main
  - **NEXT**: Gradual rollout execution (0% → 10% → 50% → 100% → stabilization)
  - Phase 1 (Days 22-26): Internal canary at 10%
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

**Stream 3: Production Rollout (Days 22-52)** — 🔄 IN PROGRESS

Preparation Phase (Before Day 22):

**Step -1: D1 Target Preflight** (TOOL-COMPLETE, operator action required)
- [x] **TOOL-COMPLETE**: D1 target preflight guardrail implemented
- [x] **TOOL-COMPLETE**: Detects unsafe D1 ID sharing patterns (preview-production critical, root sharing warnings)
- [x] **TOOL-COMPLETE**: Validates required migration files exist
- [x] **TOOL-COMPLETE**: Generates Markdown preflight report with Cloudflare D1 commands
- [ ] **OPERATOR-ACTION**: Run `corepack pnpm phase6a:d1:preflight` and review report
- [ ] **OPERATOR-ACTION**: Resolve D1 configuration issues (especially preview-production sharing)
- [ ] **OPERATOR-ACTION**: Apply migrations 0014, 0015, 0016 only after explicit confirmation
- [ ] Reference: `docs/phase-6a-d1-target-preflight-task.md`

**Step 0: Telemetry Setup** (CODE-COMPLETE in main, live-operator verification required)
- [x] **CODE-COMPLETE**: Wire energy collector to use `instrumentedFetch()` (merged to main)
- [x] **CODE-COMPLETE**: D1 schema and API health endpoints implemented
- [ ] **LIVE-VERIFY**: Confirm D1 migrations 0014/0015/0016 are applied (Step -1 prerequisite)
- [ ] **LIVE-VERIFY**: Run staging collection and verify metrics recorded to `api_health_metrics`
- [ ] **LIVE-VERIFY**: Confirm `/api/admin/api-health` returns live data in staging
- [ ] **LIVE-VERIFY**: Verify telemetry flowing in staging environment
- [ ] Reference: `docs/TELEMETRY_SETUP_GUIDE.md`, `docs/phase-6a-staging-telemetry-verification-task.md`

**Step 1: Grafana Monitoring Setup**
- [ ] Import Grafana dashboard (`docs/grafana-api-health-dashboard.json`)
- [ ] Configure 5 Grafana alert rules (`docs/grafana-api-health-alerts.md`)
- [ ] Test dashboard queries against live D1 data
- [ ] Verify alert routing (Slack, PagerDuty)
- [ ] Reference: `docs/GRAFANA_SETUP_GUIDE.md`

**Step 2: Evidence Capture & Readiness Report**
- [ ] Run Phase 6A evidence capture tool to verify all prerequisites
  - `corepack pnpm phase6a:evidence -- --base-url https://staging-worker.example.com`
  - Review generated report: status should be "ready"
  - Save report as ops record
  - Reference: `docs/phase-6a-canary-evidence-capture.md`, `docs/phase-6a-staging-telemetry-verification-task.md`

**Step 3: Team Communication & Procedures**
- [ ] Update team comms (schedule, phases, success criteria)
- [ ] Create incident response runbook (rollback procedures, root cause investigation)
- [ ] Rehearse rollback procedure (ENERGY_ROLLOUT_PERCENT=0)

Execution Phase:
- [ ] Week 1 (Days 22-26): Internal canary at 10% (5-day monitoring)
  - Day 22: Deploy ENERGY_ROLLOUT_PERCENT=10, verify canary setup
  - Days 23-26: Execute daily monitoring checklist
- [ ] Week 2 (Days 27-35): Public expansion 50%
  - Day 27: Increase to ENERGY_ROLLOUT_PERCENT=50
  - Days 28-35: Monitor 50/50 split, compare metrics
- [ ] Week 3 (Days 36-42): Full rollout 100%
  - Day 36: Increase to ENERGY_ROLLOUT_PERCENT=100
  - Days 37-42: Monitor for regressions
- [ ] Week 4 (Days 43-52): Stabilization
  - Days 43-52: Long-term stability monitoring, prepare Phase 6B

### Pre-Phase-6A: Documentation (COMPLETE)

- [x] Phase 6A/6B planning docs (8 documents created)
- [x] Validation strategy clarified (engine-independent, not snapshot comparison)
- [x] Pre-deploy gate system design documented
- [x] Failure handling per component documented
- [x] Rollout strategy (0% → 100%) documented
- [x] Rollback procedures documented
- [x] Implementation plan updated (main docs)

See: `/docs/phase-6a-energy.md`, `/docs/validation-strategy.md`, `/docs/pre-deploy-gates.md`, `/docs/energy-rollout-strategy.md`, `/docs/failure-handling.md`, `/docs/phase-6-rollback-procedures.md`, `/docs/phase-6b-macro-releases.md`, `PRE_DEPLOY_CHECKLIST.md`

## Immediate priorities

### 1. Preserve the current Oil Shock path

Keep collection, scoring, snapshot writing, and the current API surface working while making changes. The existing path should remain operational during transition unless a task explicitly says to replace it.

### 2. Stage Macro Signals changes, do not jump there conceptually

Prefer additive, foundational changes over large rewrites that assume a finished multi-engine design. Build the bridge before crossing it.

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
