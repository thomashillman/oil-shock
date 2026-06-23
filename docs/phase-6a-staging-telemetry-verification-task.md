# Phase 6A Staging Telemetry Verification Task

**Date**: 2026-04-25  
**Status**: Planning and documentation phase  
**Goal**: Enable repeatable staging telemetry verification for Phase 6A Energy rollout

---

## Goal

Add documentation and verification support for Phase 6A staging telemetry, clarifying what is code-complete and what requires live operator verification. This work supports the readiness checklist (Step 0) before the 10% canary begins on Day 22.

---

## Hard Constraints

- ❌ Do NOT change Energy scoring, collection semantics, or scheduled execution
- ❌ Do NOT change rollout percentage defaults or sign gates
- ❌ Do NOT add write calls or Phase 6B functionality
- ❌ Do NOT start the 10% canary
- ❌ Do NOT claim staging/Grafana/PagerDuty/production verification happened unless there is actual evidence
- ❌ Do NOT make real network calls in tests
- ✅ Keep as verification support and documentation only

---

## Current Repository Facts

### Code-Complete (Merged to Main)

**Infrastructure**:
- ✅ D1 schema: `api_health_metrics` and `api_feed_registry` tables (migration 0015)
- ✅ Helper library: `instrumentedFetch()` with automatic metric recording (`worker/src/lib/api-instrumentation.ts`)
- ✅ 8 feeds pre-seeded in `api_feed_registry` (migration 0016 adds diesel_crack)

**Collector Integration**:
- ✅ Energy collector already wired to use `instrumentedFetch()` (`worker/src/jobs/collectors/energy.ts`, line 4, 52)
- ✅ All three EIA feeds (WTI, Brent, Diesel/WTI Crack) instrumented

**Endpoints**:
- ✅ `/api/admin/api-health` returns per-feed health metrics (`worker/src/routes/admin-api-health.ts`)
- ✅ `/api/admin/rollout-readiness` returns comprehensive readiness assessment
- ✅ `/api/admin/rollout-status` returns current rollout phase and percentage
- ✅ `/health` returns service health and runtime mode

**Verification Tools**:
- ✅ Phase 6A evidence capture tool: `scripts/phase6a/capture-canary-evidence.ts` (PR #77)
- ✅ Evidence report formatter: `scripts/phase6a/evidence-report.ts` (PR #77)
- ✅ Package script: `corepack pnpm phase6a:evidence --base-url <url>`
- ✅ Comprehensive tests: `worker/test/phase6a/` (PR #77, 140+ tests)

### Live Verification Items (Require Manual Operator Work)

These remain manual and cannot be automated without access to live environments:

**Telemetry Verification (Prerequisites)**:
- [ ] Run staging collection through normal scheduled/manual path
- [ ] Verify metrics are recorded to `api_health_metrics` table
- [ ] Confirm `/api/admin/api-health` returns live data in staging
- [ ] Verify telemetry flowing in staging environment

**Monitoring Setup (Pre-Canary)**:
- [ ] Import Grafana dashboard from `docs/grafana-api-health-dashboard.json`
- [ ] Configure 5 alert rules from `docs/grafana-api-health-alerts.md`
- [ ] Test dashboard queries against live D1 data
- [ ] Verify alert routing (Slack, PagerDuty)

**Operational Readiness (Pre-Canary)**:
- [ ] Save evidence report as ops record
- [ ] Manual sign-offs from team leads
- [ ] Rehearse rollback procedure (ENERGY_ROLLOUT_PERCENT=0)
- [ ] Team communication and schedule aligned

**Rollout Execution (Week 1: Days 22-26)**:
- [ ] Deploy ENERGY_ROLLOUT_PERCENT=10
- [ ] Execute daily monitoring checklist
- [ ] No critical alerts or blockers

---

## This PR: Intended Commits

### Commit 1: Task Brief
Create `docs/phase-6a-staging-telemetry-verification-task.md` (this document).

**Purpose**: Document the task scope, code-complete items, live-verification items, and explain why helper script was not added.

### Commit 2: Documentation Updates
Update docs to clarify current state and verification workflow.

**Files**:
- `docs/current-priorities.md`: Mark "Wire energy collector" as complete
- `docs/TELEMETRY_SETUP_GUIDE.md`: Clarify that Energy collector is already wired, focus on verification
- `docs/phase-6a-canary-evidence-capture.md`: Add "Telemetry Verification Sequence"
- `package.json`: Add convenience script or document why not needed

### Commit 3: Priority Sync
Ensure Phase 6A readiness checklist and priorities are synchronized.

**Files**:
- `docs/current-priorities.md`: Fix package script examples, clarify verification items

---

## Files Changed So Far

### Commit 1 (Task Brief)
- ✅ `docs/phase-6a-staging-telemetry-verification-task.md` (new)

### Commit 2 (Documentation)
- `docs/current-priorities.md` (update)
- `docs/TELEMETRY_SETUP_GUIDE.md` (update)
- `docs/phase-6a-canary-evidence-capture.md` (update)
- `package.json` (optional update)

### Commit 3 (Priority Sync)
- `docs/current-priorities.md` (update)

---

## Validation Run So Far

None yet. Validation will be:
```bash
corepack pnpm docs:check
corepack pnpm phase6a:evidence:test
corepack pnpm -C worker test -- collectors
corepack pnpm -C worker typecheck
```

(Optional if cheap):
```bash
corepack pnpm ci:preflight
```

---

## Deliberately Out of Scope

**Not in this PR**:
- ❌ No helper script added (see rationale below)
- ❌ No changes to Energy collector (already complete)
- ❌ No changes to score computation, collection semantics, or scheduled execution
- ❌ No Grafana dashboard import or alert configuration (those are live-operator tasks)
- ❌ No claim that staging verification has happened
- ❌ No deployment or 10% canary start
- ❌ No Phase 6B functionality

### Why No Telemetry Helper Script?

**Considered**: Add `scripts/phase6a/verify-telemetry.ts` as a narrow smoke-check for API health.

**Decision**: Skip and do docs-only instead.

**Rationale**:
1. **PR #77 already delivers a comprehensive evidence capture tool** that covers all telemetry verification needs and more
2. **The evidence tool is the authoritative verification path** for operators before canary:
   - Checks `/health` (service health, runtime mode, database, config)
   - Checks `/api/admin/rollout-readiness` (gates, validation, evidence)
   - Checks `/api/admin/rollout-status` (rollout percent and phase)
   - Checks `/api/admin/api-health` (per-feed health and system health)
   - Generates a comprehensive Markdown report for operator review
   - Preserves HTTP status codes and error metadata
3. **Creating a narrower helper would duplicate or confuse** the evidence capture path:
   - A narrower helper would omit critical checks (gates, validation, readiness)
   - Operators need the full picture (readiness report), not a subset
   - Maintaining two verification tools creates drift risk
4. **Documentation now makes the evidence tool the standard telemetry path** with explicit "Telemetry Verification Sequence"
5. **Test coverage already exists** (140+ tests in PR #77) for all telemetry endpoints

**Conclusion**: Update docs to make the evidence capture tool the canonical telemetry verification path. It is simpler and more maintainable to have one authoritative tool than two.

---

## PR Summary

This PR:
1. Clarifies that Energy collector telemetry infrastructure is code-complete
2. Distinguishes code-complete items from live-verification items
3. Provides explicit telemetry verification sequence using the Phase 6A evidence capture tool
4. Updates docs to be accurate and current as of 2026-04-25
5. Keeps all verification paths read-only and non-mutating
6. Does not claim live verification has happened
7. Supports operational readiness before Day 22 canary execution

**Next Steps** (after this PR merges):
1. Run staging collection to verify metrics flow
2. Import Grafana dashboard and configure alerts
3. Run evidence capture tool against staging
4. Obtain manual sign-offs
5. Rehearse rollback procedure
6. Deploy ENERGY_ROLLOUT_PERCENT=10 to start canary

---

## References

- `docs/phase-6a-canary-evidence-capture.md` - Evidence capture tool documentation
- `docs/TELEMETRY_SETUP_GUIDE.md` - Telemetry setup details
- `docs/phase-6a-rollout-readiness.md` - Readiness checklist
- `docs/current-priorities.md` - Current sequencing and constraints
- `docs/phase-6a-energy.md` - Energy engine detailed design
- `worker/src/lib/api-instrumentation.ts` - instrumentedFetch implementation
- `scripts/phase6a/capture-canary-evidence.ts` - Evidence capture tool source
