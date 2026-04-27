# Current Priorities

This document captures the current sequencing and decision constraints for work in this repository.

## Current status

- **Phase 6A (Energy Engine) execution phase (Days 22-52)** — May 2026, weeks 4-8
  - Infrastructure complete: Gate system, validation tests, rollout controls, API health tracking all merged to main
  - Staging verification in progress: D1 separation complete, migrations applied, staging telemetry working
  - **CURRENT BLOCKER**: Three readiness endpoints return HTTP 503 (Cloudflare DNS platform issue)
  - **NEXT**: Restore readiness evidence and defer Grafana to later stage
  - Phase 1 (Days 22-26): Internal canary at 10% (blocked pending readiness resolution)
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

**Step 0: Telemetry Setup** (✅ LIVE-VERIFIED)
- [x] **CODE-COMPLETE**: Wire energy collector to use `instrumentedFetch()` (merged to main)
- [x] **CODE-COMPLETE**: D1 schema and API health endpoints implemented
- [x] **LIVE-VERIFIED**: D1 migrations 0014/0015/0016 applied to preview (PR #81)
- [x] **LIVE-VERIFIED**: Staging collection running, metrics recorded to `api_health_metrics`
- [x] **LIVE-VERIFIED**: `/api/admin/api-health` returning HTTP 200 with live feed data
- [x] **LIVE-VERIFIED**: Telemetry flowing in staging environment (three Phase 6A feeds healthy)
- [x] **LIVE-VERIFIED**: Provider API keys configured as Cloudflare secrets (PR #83)
- [ ] Reference: `docs/TELEMETRY_SETUP_GUIDE.md`, `docs/phase-6a-staging-telemetry-verification-task.md`

**Step 1: Live Endpoint Remediation** (🔄 IN PROGRESS — INTERMITTENT FLAPPING ONGOING)
- [x] Code review: All endpoints correct, no defects found
- [x] Investigation: Failures classified as Cloudflare edge "DNS cache overflow" (plaintext, pre-Worker)
- [x] Endpoint probing (2026-04-26 21:01 UTC): 40 sequential single requests succeeded (100% success in that window)
- [x] Ray ID analysis: All requests routed through ORD colo, Worker reachable when requests succeed
- [x] Worker code verified healthy when requests succeed: valid JSON, DB latency 22ms, 6/6 gates signed
- [x] **CHARACTERIZED**: Failures are intermittent and flap between endpoints (any of the 4 may fail; failures rotate)
- [x] **CHARACTERIZED**: Sequential single-curl rarely fails; concurrent `Promise.all` requests in evidence script trigger failures more often
- [x] **CHARACTERIZED**: Failures cluster in time — there are minutes with ~40% failure and minutes with 0% failure
- [x] Latest fresh evidence (2026-04-27 08:32:18 UTC): All 4 endpoints HTTP 200, Status READY (single snapshot)
- [ ] **OUTSTANDING**: A single READY snapshot is not proof of stability. Sustained probing or Cloudflare-side root cause analysis required before canary
- [ ] Reference: `docs/evidence/phase6a-dns-cache-overflow-investigation.md`, `docs/evidence/phase6a-cloudflare-mcp-investigation.md`, `docs/evidence/phase6a-staging-telemetry-verification.md`

**Status**: The HTTP 503 "DNS cache overflow" issue is **intermittent and ongoing**. The latest snapshot (2026-04-27 08:32:18 UTC) shows all endpoints healthy, but flapping was directly observed minutes earlier (2026-04-27 08:30:05 and 08:30:34 UTC, with different endpoints failing each time). Cloudflare API/observability tools were not available in this session, so server-side root cause cannot be confirmed. **Endpoint reliability is not yet proven stable enough for canary monitoring.**

**Step 2: Evidence Capture & Readiness Report** (⚠️ COMPLETE BUT NOT STABLE)
- [x] Fresh evidence capture run at 2026-04-27 08:32:18 UTC: **COMPLETE** (all 4 endpoints HTTP 200)
- [x] Evidence report shows: Status = **READY** (current snapshot)
- [x] Formatter safety fix verified: incomplete captures consistently show BLOCKED, complete+ready captures show READY
- [ ] **CAVEAT**: Single snapshot does not prove sustained reliability. Multiple recent captures showed BLOCKED.
- [x] Reference: `docs/phase-6a-canary-evidence-capture.md`, `docs/evidence/phase6a-staging-telemetry-verification.md`

**Status**: The latest evidence capture is complete and shows READY, but earlier captures within the same hour showed BLOCKED. The intermittent failure pattern means a single READY capture is not sufficient evidence to proceed. Recommend running sustained capture (every 5 minutes for 1 hour) and confirming 0% failure rate before treating Step 2 as fully unblocked.

**Step 3: Team Communication & Procedures** (After evidence validation)
- [ ] Update team comms (schedule, phases, success criteria)
- [ ] Create incident response runbook (rollback procedures, root cause investigation)
- [ ] Rehearse rollback procedure (ENERGY_ROLLOUT_PERCENT=0)

**Step 4: Grafana Monitoring Setup** (🔄 DEFERRED — NOT immediate blocker)
- [ ] Import Grafana dashboard (`docs/grafana-api-health-dashboard.json`)
- [ ] Configure 5 Grafana alert rules (`docs/grafana-api-health-alerts.md`)
- [ ] Test dashboard queries against live D1 data
- [ ] Verify alert routing (Slack, PagerDuty)
- **Note**: Grafana is required before wider rollout stages (50% → 100%), but not the immediate blocker for 10% canary readiness. Required before Day 27 (Phase 2 expansion). 
- [ ] Reference: `docs/GRAFANA_SETUP_GUIDE.md`

**Blockers Before Execution Phase:**
- ⚠️ **CRITICAL: Endpoint reliability**: Intermittent flapping between HTTP 200 and HTTP 503 "DNS cache overflow" observed across multiple endpoints on 2026-04-27 (08:30 to 08:32 UTC). Latest snapshot at 08:32:18 UTC shows all endpoints OK, but stability not yet proven across sustained probing.
- ⚠️ **CRITICAL: Evidence capture**: Latest capture at 2026-04-27 08:32:18 UTC shows COMPLETE and READY, but earlier captures within the same hour showed BLOCKED. Single snapshot insufficient — recommend sustained probing.
- ❌ **Accountable owner gate sign-off review**: Gates signed by PoC (phase6a-poc), require review by owners
- ⏳ **Provider key rotation**: Status NOT VERIFIED (assume configured as Cloudflare secrets in PR #83, but not explicitly confirmed)
- ⏳ **Rollback rehearsal**: Not yet executed in staging
- ⏳ **Team comms**: Not yet sent to wider team

**10% Canary status:** Latest evidence snapshot is READY, but underlying endpoint reliability is not yet proven stable. Critical work remaining:
1. ⚠️ Endpoint reliability — confirm sustained 0% failure rate or fix Cloudflare-side root cause (Step 1)
2. ⚠️ Evidence capture — latest snapshot READY, but verify with sustained probing (Step 2)
3. ❌ Accountable owners review and confirm gate sign-offs (Step 3)

Execution Phase (Blocked — awaiting Step 1-3):
- [ ] Week 1 (Days 22-26): Internal canary at 10% (5-day monitoring) — BLOCKED pending endpoint remediation
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
