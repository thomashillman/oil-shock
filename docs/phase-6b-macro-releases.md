# Phase 6B: Macro Releases Engine (Q3 2026, Post-Stabilization)

**Timeline**: Q3 2026 (July 2026 earliest)  
**Owner**: Macro engineering team  
**Status**: Deferred pending Phase 6A stabilization

## Overview

Phase 6B adds the macro_releases engine, which collects CPI (Consumer Price Index) data from the BLS API and scores it using rules. This phase is deferred until after Phase 6A (energy engine) has been stable in production for 4+ weeks.

## Why Phase 6B is Deferred to Q3

1. **Monthly data constraint**: CPI is released monthly. Validating a monthly signal requires 8-12 weeks of historical accumulation. Shipping in 2 weeks is meaningless.

2. **Energy stabilization first**: Energy engine (daily data) needs 4+ weeks in production to identify and fix issues before adding a second engine.

3. **Multi-engine rollout complexity**: Running two engines simultaneously requires additional monitoring and fallback logic. Phase 6A establishes the foundation.

4. **BLS API design**: Error handling, rate limiting, and fallback strategy need design review. Better done after Phase 6A is stable.

5. **Operator dashboard gaps**: Macro-specific UI (CPI release tracking, BLS health) is deferred. Phase 6A establishes baseline; Phase 6B adds macro-specific features.

## Readiness Status (April 2026)

**Parsing and Testing Infrastructure Ready**

The following foundation is in place for Phase 6B readiness (not Phase 6B implementation):

- ✅ BLS CPI response fixtures (realistic API shapes, edge cases)
- ✅ Deterministic parser tests (CPI value extraction, period handling, malformed data)
- ✅ Minimal CPI parser implementation (`worker/src/jobs/collectors/macro-releases.ts`)
- ✅ Disabled-by-default collector shell (not wired into scheduled execution)

**What This Readiness Does NOT Include**

- ❌ Live BLS API fetch (disabled)
- ❌ CPI observation write path (database integration deferred)
- ❌ Macro scoring rules (scoring logic deferred)
- ❌ Scheduled execution (collector not wired into `runCollection`)
- ❌ UI or dashboard changes
- ❌ Multi-engine scheduling changes

**Next Steps for Phase 6B Implementation** (after Phase 6A stabilizes)

1. Enable live BLS API fetch behind explicit feature flag
2. Add observation write path once runtime target decisions are confirmed
3. Add macro scoring only after Phase 6A stability and sufficient CPI history
4. Integrate into multi-engine collection and scoring pipeline

## Phase 6B Prerequisites

Before Phase 6B can begin:

1. **Phase 6A is stable in production** (4+ weeks)
   - All gates passing continuously
   - Collector error rate < 1%
   - Zero unintended rollbacks
   - Operator dashboards confirmed working

2. **Historical CPI data accumulated** (8-12 weeks)
   - Collector has been running for 8+ weeks
   - At least 2-3 CPI releases captured
   - Patterns visible (monthly releases, typical values)

3. **BLS API integration designed**
   - Error handling strategy defined
   - Rate limiting plan documented
   - API key rotation plan established
   - Fallback behavior specified

4. **Design review completed**
   - `/docs/bls-api-integration.md` reviewed and approved
   - `/docs/failure-handling.md` extended for macro engine
   - Multi-engine monitoring dashboard designed

## Phase 6B Scope

### Code Changes
- `worker/src/jobs/collectors/macro-releases.ts` — BLS API collector
- `worker/src/core/scorers/macro-releases.ts` — Macro releases scorer
- `worker/src/jobs/score.ts` — Add `runMacroReleasesScore()` call
- `worker/src/routes/state.ts` — Add `/api/v1/macro_releases/state` endpoint
- `worker/src/routes/health.ts` — Add macro health tracking
- Feature flag: `MACRO_ROLLOUT_PERCENT` for gradual rollout
- Multi-engine feature flag: `ENABLE_MULTI_ENGINE_ROLLOUT`

### Documentation
- `/docs/bls-api-integration.md` — BLS API design and error handling
- `/docs/macro-validation-strategy.md` — Validation gates for macro engine
- `/docs/macro-rollout-strategy.md` — Gradual rollout for macro engine
- Updates to: `/docs/implementation-plan.md`, `/docs/phase5-dashboards.md`

### Dashboard Enhancements
- CPI feed freshness indicator
- CPI surprise visualization (monthly)
- Macro rule editor in operator dashboard
- Multi-engine monitoring (combined view)
- BLS API health status indicator

## Phase 6B Timeline (Estimated)

### Week 1-2: BLS API Integration Design
```
[ ] Design BLS API collector architecture
[ ] Document error handling and fallbacks
[ ] Design API key management
[ ] Create `/docs/bls-api-integration.md`
[ ] Design review and approval
```

### Week 3-4: Implementation
```
[ ] Implement collector (fetch CPI data from BLS)
[ ] Implement scorer (CPI → score + confidence)
[ ] Add seed rules for macro engine
[ ] Write determinism tests
[ ] Write data freshness tests
```

### Week 5-6: Validation
```
[ ] 8-12 weeks of historical CPI data available
[ ] Run validation gates (same as Phase 6A)
[ ] Validate multi-engine coordination
[ ] Implement per-component health tracking
```

### Week 7-8: Gradual Rollout
```
[ ] Internal canary (10% traffic)
[ ] Expand to 50%
[ ] Full rollout (100%)
[ ] Monitor combined energy+macro system
```

## Validation Gates for Phase 6B

Same structure as Phase 6A, tailored to macro data:

### Gate 1: Macro Determinism
- Scorer produces identical output for identical CPI metrics
- Test: Run `runMacroReleasesScore()` twice with same inputs
- Target: 100% pass

### Gate 2: Macro Data Freshness
- Collector produces consistent CPI values across runs
- Test: Compare multiple monthly CPI releases
- Target: < 5% variance

### Gate 3: Macro Rule Consistency
- Rules adjust scores correctly for macro engine
- Test: `/api/admin/rules-compare?engineKey=macro_releases`
- Target: 100% expected deltas

### Gate 4: BLS API Error Handling
- API failures handled gracefully (no cascading failures)
- Test: Simulate transient and permanent API failures
- Target: Collector gracefully skips, scoring continues

### Gate 5: Multi-Engine Coordination
- Energy and macro engines run without interference
- Test: Both engines scoring simultaneously
- Target: No cross-engine errors

## BLS API Design (Placeholder)

### Endpoint
```
POST https://api.bls.gov/publicAPI/v2/timeseries/data
```

### Rate Limiting
- 5 requests per minute per IP
- Macro collector: 1 request per hour (CPI monthly, fetch latest)

### Error Handling
```
Success (HTTP 200):
  → Extract CPI value, write to series_points

Transient (HTTP 429, 503, timeout):
  → Log warning, skip write, retry next hour
  → Do NOT fail entire pipeline

Permanent (HTTP 401, 403, 404):
  → Log error, alert team, skip write
  → Macro scoring continues with "missing_data" flag
```

### Fallback Behavior
```
If BLS API down:
  → Macro engine continues scoring with missing CPI data
  → Adds flag: ["missing_macro_data"]
  → Confidence: 0.4 (low confidence)
  → Energy engine unaffected
  → Overall system remains operational
```

## Operator Dashboard Extensions (Phase 6B)

Add to operator dashboard:

**CPI Feed Card**:
```
CPI Latest Release: 2026-04-12 (12 days old)
Monthly Release: Next expected 2026-05-12
Current Surprise: +0.3% (normalized to 0.15)
Status: ✓ Fresh
```

**Macro Rules Panel**:
```
Active Rules for macro_releases:
- macro.inflation_surprise_high (weight: 0.05)
- macro.inflation_surprise_low (weight: 0.02)
```

**Combined Engine Dashboard**:
```
Energy: ✓ Operational (1,247 runs this week)
Macro:  ✓ Operational (4 releases this month)
Combined Score: 0.52 (energy) + 0.15 (macro) = 0.67
```

## Multi-Engine Monitoring Metrics

Track per engine and combined:

| Metric | Energy | Macro | Combined |
|--------|--------|-------|----------|
| Collector success rate | > 99% | > 95% | - |
| Scorer execution time | < 100ms | < 50ms | < 150ms |
| Guardrail flag frequency | < 5% | < 10% | - |
| Score confidence (avg) | > 0.7 | > 0.6 | > 0.65 |

## Success Criteria for Phase 6B

### Gates
- All 5 validation gates passing continuously
- Multi-engine coordination verified

### Stability
- Zero cascading failures between engines
- BLS API failures don't affect energy engine
- Operator dashboard displays both engines correctly

### Rollout
- Gradual rollout: 0% → 100% with no rollbacks
- Combined system stable for 4+ weeks

### Documentation
- BLS API integration fully documented
- Multi-engine runbooks written
- Deprecation timeline for snapshots finalized

## Post-Phase-6B: Snapshot Deprecation

After Phase 6A (energy) + Phase 6B (macro) are stable for 8+ weeks:

1. **Timeline**: Target Q4 2026
2. **Action**: Sunset Oil Shock snapshot routes
3. **Fallback**: Archived snapshots remain for historical query
4. **Clients**: Update to use `/api/v1/energy/state` + `/api/v1/macro_releases/state`

## Risk Mitigation

### Risk: BLS API unavailable
**Mitigation**: Graceful degradation; macro scoring continues with missing data flag

### Risk: Monthly data too sparse
**Mitigation**: Deferral to Q3 ensures 8+ weeks accumulation before shipping

### Risk: Multi-engine interference
**Mitigation**: Per-component error tracking; failures isolated to single engine

### Risk: Operator confusion (two engines)
**Mitigation**: Combined dashboard; clear UI for engine selection

## References

- `/docs/phase-6a-energy.md` — Phase 6A (energy) implementation
- `/docs/failure-handling.md` — Partial failure modes
- `/docs/bls-api-integration.md` — BLS API design (forthcoming)
- `db/migrations/0012_stage4_new_engines.sql` — Macro engine schema
- `worker/src/engines/macro_releases/` — Directory for macro-specific code (when created)
