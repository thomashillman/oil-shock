# Phase 6A: Energy Engine Implementation Plan

**Timeline**: 3-4 weeks (May 2026)  
**Owner**: Energy engineering team  
**Status**: In progress

## Overview

Phase 6A ships the energy engine to production with enforced pre-deploy gates and gradual rollout. The energy engine collects EIA data (WTI, Brent, Diesel spreads), scores them using rules from the `rules` table, and serves scores via `/api/v1/energy/state`.

Oil Shock snapshots remain archived and readable as a fallback during rollout.

---

## Phase 6A Goals

1. ✓ Ship energy engine with enforced pre-deploy gates
2. ✓ Validate energy engine independently (determinism, freshness, rule consistency)
3. ✓ Implement gradual rollout: 0% → 10% → 50% → 100% over 3-4 weeks
4. ✓ Establish operational procedures and monitoring
5. ✓ Document rollback procedures post-migration-0013

## What Ships in Phase 6A

### Code Changes
- Energy collector: Already exists (`worker/src/jobs/collectors/energy.ts`), already active
- Energy scorer: Already exists (`worker/src/engines/oilshock/score.ts`), already active
- Pre-deploy gate system: NEW (`/api/admin/gate-status` endpoint)
- Health endpoint enhancements: NEW (`runtimeMode`, `degradedComponents` fields)
- Admin rules bug fix: Fix `updateRuleByKey` to accept `engineKey` parameter
- Gradual rollout controls: NEW (`ENERGY_ROLLOUT_PERCENT` feature flag)
- Validation endpoints: NEW (`/api/admin/rules-compare`, `/api/admin/validation-status`)
- Per-component error tracking: Enhanced job logging

### Documentation
- `/docs/validation-strategy.md` — Validation stories and gates
- `/docs/phase-6a-energy.md` — This document
- `/docs/phase-6b-macro-releases.md` — Q3 macro engine plan
- `/docs/pre-deploy-gates.md` — Enforced gate system
- `/docs/failure-handling.md` — Partial failure modes
- `/docs/energy-rollout-strategy.md` — Gradual rollout procedure
- `/docs/phase-6-rollback-procedures.md` — Safe rollback post-migration-0013
- `PRE_DEPLOY_CHECKLIST.md` — Gate sign-off tracking
- Updates to `/docs/implementation-plan.md`, `/docs/current-priorities.md`, `/docs/replay-validation.md`

### What Stays Frozen
- Oil Shock snapshots (archived, read-only fallback)
- Macro_releases engine (deferred to Phase 6B, Q3 2026)
- BLS API integration (deferred to Phase 6B)

---

## Validation Gates (Must Pass Before Rollout)

### Gate 1: Energy Determinism ✓ Target: 100% pass
**What**: Energy scorer produces identical output for identical inputs.

**Test**: `worker/test/jobs/collectors/energy.test.ts` → Determinism test
```
Run runEnergyScore() twice with same metrics
Assert: output is bit-identical both times
```

**Owner**: Energy engineering  
**Timeline**: Pre-deployment  
**Pass criteria**: 100% of test cases pass

**Command**:
```bash
corepack pnpm -C worker test -- energy.test.ts
```

---

### Gate 2: Energy Data Freshness ✓ Target: < 5% variance
**What**: Collector produces consistent metrics across runs.

**Test**: `worker/test/jobs/collectors/energy.test.ts` → Data freshness test
```
Run collectEnergy() at T0 and T0+24h
Compare: normalized series_points values
Assert: variance < 5%
```

**Owner**: Data quality  
**Timeline**: 7+ days monitoring in staging  
**Pass criteria**: Variance < 5%, no data loss

**Monitoring**: Check latest energy series_points in database every 24h

---

### Gate 3: Rule Consistency ✓ Target: 100% expected deltas
**What**: Rules adjust scores correctly and deterministically.

**Test**: `/api/admin/rules-compare` dry-run endpoint
```
Test input: physicalStress=0.65, priceSignal=0.35, marketResponse=0.58
Rule: energy.confirmation.spread_widening (weight: 0.04)
Expected delta: +0.04
Actual delta: +0.04 ✓
```

**Owner**: Rules team  
**Timeline**: Before any live rule changes  
**Pass criteria**: All test rules produce expected deltas

**Command**: Manual via operator dashboard or curl:
```bash
POST /api/admin/rules-compare
{
  "engineKey": "energy",
  "testMetrics": {...},
  "overrideRule": {...}
}
```

---

### Gate 4: Guardrail Correctness ✓ Target: 100% correct flags
**What**: Guardrails correctly identify stale/missing data.

**Test**: `worker/test/guardrails/evaluate.test.ts` (existing)
```
Test: Fresh data → no stale flags
Test: Stale data (> 8 days) → stale flag
Test: Missing feed → missing flag
Assert: All 6 test cases pass
```

**Owner**: Data quality  
**Timeline**: Pre-deployment  
**Pass criteria**: 100% of guardrail tests pass

**Command**:
```bash
corepack pnpm -C worker test -- guardrails/evaluate.test.ts
```

---

### Gate 5: Health Endpoint Schema ✓ Target: Backward compatible
**What**: Health endpoint includes `runtimeMode` and `degradedComponents`.

**Test**: `worker/test/routes/health.test.ts` (new)
```
GET /health
Assert: response.runtimeMode in ["oilshock", "macro-signals"]
Assert: response.degradedComponents is array
Assert: existing fields (ok, dependencies) unchanged
```

**Owner**: Platform  
**Timeline**: Before flag flip  
**Pass criteria**: Schema matches contract, no breaking changes

**Command**:
```bash
corepack pnpm -C worker test -- routes/health.test.ts
```

---

### Gate 6: Gradual Rollout Monitoring ✓ Target: All metrics visible
**What**: Observability dashboard captures all key metrics.

**Metrics to monitor**:
- Energy collector error rate (target: < 1%)
- Energy scorer execution time (target: < 100ms)
- Guardrail flag frequency (target: < 5% of runs)
- Score divergence from baseline (histogram)
- Health endpoint reports

**Owner**: Observability  
**Timeline**: Before production rollout  
**Pass criteria**: All metrics visible in dashboard; alerts configured

---

## Implementation Timeline

### Days 1-3: Documentation and Design
**Deliverables**:
- ✓ `/docs/validation-strategy.md` — What we validate and why
- → `/docs/phase-6a-energy.md` — This document
- → `/docs/phase-6b-macro-releases.md` — Q3 macro plan
- → `/docs/pre-deploy-gates.md` — Gate system design
- → `/docs/failure-handling.md` — Failure modes
- → `/docs/energy-rollout-strategy.md` — Rollout phases
- → `/docs/phase-6-rollback-procedures.md` — Safe rollback
- → `PRE_DEPLOY_CHECKLIST.md` — Gate tracking
- → Update `/docs/implementation-plan.md` (Stage 6 → Phase 6A/6B)
- → Update `/docs/current-priorities.md` (Phase 6A priorities)

**Tasks**:
```
[ ] Create all documentation files (see list above)
[ ] Get sign-off on Phase 6A/6B split
[ ] Get sign-off on validation strategy
[ ] Create PRE_DEPLOY_CHECKLIST.md tracking document
```

---

### Days 4-7: Gate Infrastructure and Health Endpoint
**Deliverables**:
- `worker/src/routes/admin-gates.ts` — NEW gate status endpoint
- `worker/src/routes/health.ts` — UPDATED with runtimeMode, degradedComponents
- `worker/test/routes/health.test.ts` — NEW schema compatibility tests

**Tasks**:
```
[ ] Implement /api/admin/gate-status endpoint
[ ] Update /worker/src/routes/health.ts
[   - Add runtimeMode field (detect ENABLE_MACRO_SIGNALS flag)
[   - Add degradedComponents array field
[   - Add backward compatibility layer
[ ] Write health.test.ts for schema validation
[ ] Run: corepack pnpm -C worker test -- routes/health.test.ts
```

**Code sketch**:
```typescript
// /api/admin/gate-status returns
{
  "gatesPassedCount": 4,
  "gatesTotalCount": 6,
  "gates": {
    "energy_determinism": { "passed": true, "lastCheck": "2026-05-01T14:30Z" },
    "energy_data_freshness": { "passed": false, "reason": "Need 7+ days of monitoring", "nextCheck": "2026-05-08T14:30Z" },
    ...
  },
  "blockingFlagFlip": true  // true if any gate fails
}
```

---

### Days 8-14: Validation and Testing
**Deliverables**:
- `worker/test/jobs/collectors/energy.test.ts` — Energy determinism & freshness tests
- `worker/src/routes/admin-rules.ts` — NEW `/api/admin/rules-compare` endpoint
- `worker/test/routes/admin-rules.test.ts` — Add rule comparison tests

**Tasks**:
```
[ ] Implement energy determinism test
[   - Run runEnergyScore() twice with same inputs
[   - Assert output identical
[ ] Implement energy data freshness test
[   - Run collectEnergy() in succession
[   - Assert variance < 5%
[ ] Implement /api/admin/rules-compare endpoint
[   - Accept baselineRules, overrideRule, testMetrics
[   - Return delta comparison
[ ] Add comprehensive test coverage
[ ] Run: corepack pnpm -C worker test
```

---

### Days 15-21: Failure Handling and Observability
**Deliverables**:
- `worker/src/jobs/score.ts` — Per-component error tracking
- `worker/src/routes/admin-validation.ts` — NEW validation status endpoints
- Feature flag `ENERGY_ROLLOUT_PERCENT` (0-100)
- `/api/admin/rollout-status` endpoint

**Tasks**:
```
[ ] Add per-component health tracking to score job
[   - Track collector errors separately from scorer errors
[   - Log component failures with context
[ ] Implement /api/admin/validation-status endpoint
[   - Report determinism test results
[   - Report data freshness results
[   - Report rule consistency
[   - Report guardrail correctness
[ ] Add ENERGY_ROLLOUT_PERCENT feature flag
[   - 0 = serve all snapshots
[   - 50 = serve energy to 50% of requests, snapshots to 50%
[   - 100 = serve all energy
[ ] Implement /api/admin/rollout-status endpoint
[   - Report current rollout percentage
[   - Report collector/scorer error rates
[   - Report guardrail flag frequency
[ ] Implement graceful degradation
[   - If collector fails: continue with stale data, add flag
[   - If scorer fails: return archived snapshot with degradation flag
[ ] Create Grafana dashboard queries for monitoring
```

---

### Days 22-28: Production Deployment (Gradual Rollout)
**Phases**:

**Week 1: Internal Canary (Days 22-26)**
```
Set ENERGY_ROLLOUT_PERCENT = 10
Serve to: Internal IPs only (staging/dev)
Duration: 5 days
Monitor: Collector errors, scorer latency, guardrail flags
Gate sign-off: "No divergence spikes, error rate < 1%"
```

**Week 2: Expand Rollout (Days 27-35)**
```
Set ENERGY_ROLLOUT_PERCENT = 50
Serve to: 50% of traffic (random split)
Duration: 9 days
Monitor: Per-group metrics divergence
Gate sign-off: "Scores stable at 50%, no user impact"
```

**Week 3: Full Rollout (Days 36-42)**
```
Set ENERGY_ROLLOUT_PERCENT = 100
Serve to: All traffic
Duration: 7 days
Monitor: Full observability dashboard
Gate sign-off: "All gates passing, no unintended rollbacks"
```

**Week 4: Stabilization (Days 43-52)**
```
Continue monitoring
Prepare snapshot deprecation timeline
Document lessons learned
Plan Phase 6B macro engine (Q3)
```

---

## Admin Rules Bug Fix

### Current Issue
`updateRuleByKey()` in `worker/src/db/client.ts` hardcodes `engine_key = 'oil_shock'`. This breaks rule updates for the energy engine.

### Audit Results
Search for `updateRuleByKey` call sites:
```
Found:
- /worker/src/routes/admin-rules.ts:28 in handleUpdateRule()
  Current: updateRuleByKey(env, ruleKey, updates)
  Required: updateRuleByKey(env, engineKey, ruleKey, updates)
```

### Fix
Change function signature to accept `engineKey`:

```typescript
// OLD
export async function updateRuleByKey(
  env: Env,
  ruleKey: string,
  updates: { weight?: number; ... }
): Promise<void> { ... }

// NEW
export async function updateRuleByKey(
  env: Env,
  engineKey: string,
  ruleKey: string,
  updates: { weight?: number; ... }
): Promise<void> { ... }
```

Update call site in `handleUpdateRule`:
```typescript
const engineKey = body.engineKey || "oil_shock";  // default for backward compat
await updateRuleByKey(env, engineKey, ruleKey, updates);
```

### Tests Required
```typescript
test("updates rules for energy engine when engineKey specified", () => {
  // Create rule with engineKey="energy"
  // Update rule with engineKey="energy"
  // Verify updated
})

test("updates rules for oil_shock when engineKey omitted", () => {
  // Create rule (defaults to oil_shock)
  // Update rule (defaults to oil_shock)
  // Verify updated
})
```

---

## Success Criteria for Phase 6A

### Gates
- ✓ Gate 1 (Determinism): 100% pass
- ✓ Gate 2 (Data Freshness): < 5% variance
- ✓ Gate 3 (Rule Consistency): 100% expected deltas
- ✓ Gate 4 (Guardrail Correctness): 100% correct flags
- ✓ Gate 5 (Health Schema): Backward compatible
- ✓ Gate 6 (Rollout Monitoring): All metrics visible

### Rollout
- ✓ Internal canary: 0 unintended rollbacks, error rate < 1%
- ✓ 50% rollout: Stable, no user-facing impact
- ✓ 100% rollout: All gates passing continuously
- ✓ No production incidents

### Documentation
- ✓ All Phase 6A docs complete and reviewed
- ✓ Operator runbooks tested
- ✓ Rollback procedures documented and validated
- ✓ Deprecation timeline for snapshots defined

### Tests
- ✓ `corepack pnpm -C worker test` passes
- ✓ `corepack pnpm replay:validate` passes (Oil Shock unchanged)
- ✓ `corepack pnpm docs:check` passes
- ✓ `corepack pnpm ci:preflight` passes

---

## Phase 6B Deferral

Macro_releases engine (CPI data from BLS API) is deferred to Q3 2026 because:
1. Monthly data requires 8-12 weeks for meaningful validation
2. Energy engine needs 4+ weeks stabilization before expanding rollout
3. BLS API error handling and fallback strategy need design review
4. Operator dashboard needs macro-specific UI (deferred)

Phase 6B will be a separate initiative after Phase 6A is stable in production.

---

## References

- `/docs/validation-strategy.md` — Validation strategy and gates
- `/docs/energy-rollout-strategy.md` — Detailed rollout phases
- `/docs/failure-handling.md` — Partial failure modes
- `/docs/phase-6-rollback-procedures.md` — Safe rollback
- `PRE_DEPLOY_CHECKLIST.md` — Gate sign-off tracking
- `worker/src/jobs/collectors/energy.ts` — Energy collector (active)
- `worker/src/engines/oilshock/score.ts` — Energy scorer (active)
- `db/migrations/0013_phase3_freeze_snapshots.sql` — Context for rollback
