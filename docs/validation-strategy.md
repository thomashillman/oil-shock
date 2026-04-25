# Validation Strategy: Oil Shock Determinism vs. Macro Signals Validation

This document clarifies what we validate at each stage of the Macro Signals migration and why comparisons between Oil Shock snapshots and new engines are not meaningful.

## Background

As of migration 0013 (2026-04-24):
- Oil Shock collection is retired (no new data collected)
- Oil Shock snapshots are frozen (no new writes to `signal_snapshots`)
- Oil Shock snapshot data is archived in `signal_snapshots_archive_oil_shock`
- Energy engine is active and collecting from EIA APIs
- Macro_releases engine is seeded but not yet implemented

## What We Are NOT Validating

### ❌ Oil Shock Snapshots vs. Energy Scores

This is **not a meaningful comparison** because:
1. **Different input metrics**: Oil Shock used physicalStress + priceSignal + marketResponse; Energy uses WTI/Brent spread + curve slope + diesel crack
2. **Different eras**: Snapshots are frozen as of April 24; energy scores are live and current
3. **Different scorers**: Oil Shock snapshot scoring is retired; energy uses rules-based scoring from `rules` table
4. **Different purposes**: Snapshots capture historical Oil Shock state; energy scores drive future energy-specific actions

**Verdict**: Comparing these two is apples-to-oranges. We do not use snapshot-vs-energy divergence as a validation gate.

---

## What We ARE Validating

### ✓ Validation Story 1: Oil Shock Determinism (Already Implemented)

**What**: Verify that Oil Shock's own scoring logic is deterministic and hasn't regressed.

**How**: `scripts/replay-validate.ts` runs the real `computeSnapshot`, `applyLedgerAdjustments`, and `computeDislocationState` functions against 9 fixture windows covering aligned, mild, persistent, deep, stale, and ledger-adjustment scenarios.

**Assertion**: Same inputs → same outputs, every time. `dislocationState` and `actionabilityState` match expected values.

**Scope**: Oil Shock engine only. No new engines involved.

**Status**: ✓ COMPLETE (migration 0013 baseline established)

**When to run**: Before any changes to `worker/src/core/scoring/compute.ts` or `worker/src/core/guardrails/`

**Command**:
```bash
corepack pnpm replay:validate
```

---

### ✓ Validation Story 2: Energy Engine Determinism (Phase 6A)

**What**: Verify that energy engine produces deterministic scores when given the same inputs.

**How**: New test in `worker/test/jobs/collectors/energy.test.ts` runs `runEnergyScore()` twice with identical fixture metrics and asserts output is identical.

**Assertion**: Same energy metrics (WTI/Brent spread, diesel crack) → same score value, same confidence, same rule adjustments.

**Scope**: Energy engine only, in isolation.

**Status**: Needs implementation in Phase 6A

**When to run**: Before any changes to `worker/src/core/scorers/energy.ts` or `worker/src/jobs/score.ts`

**Command**:
```bash
corepack pnpm -C worker test -- energy.test.ts
```

---

### ✓ Validation Story 3: Energy Data Freshness (Phase 6A)

**What**: Verify that energy collector produces consistent data across repeated runs.

**How**: Test runs `collectEnergy()` twice in quick succession (within 24-hour window) and compares the normalized `series_points` written to the database.

**Assertion**: 
- Same EIA API responses → same normalized metrics
- Staleness flags consistent (if data is fresh in first run, it's fresh in second run)
- No data loss or corruption between runs

**Scope**: Energy collector only, data freshness validation.

**Status**: Needs implementation in Phase 6A

**When to run**: Before deploying energy collector changes or EIA API changes.

**Command**:
```bash
corepack pnpm -C worker test -- collectors/energy.test.ts
```

---

### ✓ Validation Story 4: Rule Consistency (Phase 6A)

**What**: Verify that when rules change, the score adjustment matches expected delta.

**How**: New endpoint `/api/admin/rules-compare` accepts:
- Base rule set (current)
- Override rule set (proposed)
- Test metrics

Endpoint runs rule evaluation twice and returns comparison:
```json
{
  "baselineAdjustment": 0.04,
  "overrideAdjustment": 0.06,
  "delta": 0.02,
  "expectedDelta": 0.02,
  "consistent": true
}
```

**Assertion**: When a rule is added or modified, the score delta is deterministic and matches expectation.

**Scope**: Rule evaluation logic, independent of data quality.

**Status**: Needs implementation in Phase 6A

**When to run**: Before committing a rule change to the `rules` table; as a dry-run tool for operators.

**Endpoint**:
```bash
POST /api/admin/rules-compare
{
  "engineKey": "energy",
  "baselineRuleKey": "energy.confirmation.spread_widening",
  "overrideRule": {
    "weight": 0.05,
    "predicateJson": "{...}"
  },
  "testMetrics": {
    "physicalStress": 0.65,
    "priceSignal": 0.35,
    "marketResponse": 0.58
  }
}
```

---

### ✓ Validation Story 5: Guardrail Correctness (Phase 6A)

**What**: Verify that guardrails correctly identify and flag stale/missing data.

**How**: Test runs `evaluateGuardrails()` with various freshness states and asserts correct flag generation.

**Assertion**:
- Fresh data → no stale flags
- Stale data (past threshold) → stale flag
- Missing data → missing flag
- Combined stale+missing → both flags

**Scope**: Guardrail evaluation logic.

**Status**: Partial (existing unit tests in `worker/test/guardrails/evaluate.test.ts`); verify during Phase 6A

**When to run**: Before any changes to guardrail logic.

**Command**:
```bash
corepack pnpm -C worker test -- guardrails/evaluate.test.ts
```

---

## Validation Gates for Phase 6A

These gates must pass before energy engine is switched to default in `/api/state`:

### Gate 1: Energy Determinism
- **Validation**: Energy determinism test passes (same scorer, same inputs → same outputs)
- **Target**: 100% pass rate
- **Owner**: Energy engineering team
- **Timeline**: Complete before production deployment

### Gate 2: Energy Data Freshness
- **Validation**: Collector produces consistent data across runs; staleness flags correct
- **Target**: &lt; 5% variance in normalized values across repeated runs
- **Owner**: Data quality team
- **Timeline**: 7+ days of monitoring in staging

### Gate 3: Rule Consistency
- **Validation**: Rule evaluation is deterministic; deltas match expected adjustments
- **Target**: 100% of test rules produce expected deltas
- **Owner**: Rules team
- **Timeline**: Before any live rule changes

### Gate 4: Guardrail Correctness
- **Validation**: Guardrails correctly flag stale/missing data
- **Target**: 100% correct flag generation on test cases
- **Owner**: Data quality team
- **Timeline**: Before production deployment

### Gate 5: Health Endpoint Schema
- **Validation**: Health endpoint returns `runtimeMode` and `degradedComponents` fields
- **Target**: Schema matches documented contract; backward compatible
- **Owner**: Platform team
- **Timeline**: Before flag flip

### Gate 6: Gradual Rollout Monitoring
- **Validation**: Observability dashboard captures collector errors, scorer latency, guardrail flags
- **Target**: All metrics visible and alerting configured
- **Owner**: Observability team
- **Timeline**: Before production rollout

---

## What Comparison Endpoints Are For

### `/api/admin/compare-paths` (Existing, Historical Use Only)

This endpoint compares Oil Shock snapshots against energy scores. **This is for migration audit only**, not ongoing validation:

```bash
GET /api/admin/compare-paths?feedKey=energy.state&sinceDays=14
```

Returns:
```json
{
  "snapshotVersion": { "score": 0.45, "confidence": 0.8 },
  "scoresTableVersion": { "score": 0.52, "confidence": 0.7 },
  "comparison": {
    "scoreDiff": 0.07,
    "flagsMatch": false,
    "stateMatch": false
  }
}
```

**Why it diverges**: Different engines, different eras, different metrics. This is expected.

**Use case**: Understanding why the two tables differ after migration; not for ongoing validation gates.

---

### `/api/admin/validation-status` (New, Phase 6A)

This endpoint reports actual validation results for the current energy engine:

```bash
GET /api/admin/validation-status?engineKey=energy
```

Returns:
```json
{
  "engineKey": "energy",
  "determinismTest": {
    "lastRun": "2026-05-01T14:30:00Z",
    "passed": true,
    "message": "Determinism test passed: 100% consistency across 50 runs"
  },
  "dataFreshnessTest": {
    "lastRun": "2026-05-01T14:30:00Z",
    "passed": true,
    "variance": 0.02,
    "threshold": 0.05
  },
  "ruleConsistencyTest": {
    "lastRun": "2026-05-01T14:00:00Z",
    "testCount": 12,
    "passed": 12,
    "failed": 0
  },
  "guardrailTest": {
    "lastRun": "2026-04-30T23:00:00Z",
    "passed": true,
    "flagsCorrect": "100%"
  },
  "overallStatus": "PASS"
}
```

---

## Validation Frequency

| Validation | Trigger | Frequency |
|-----------|---------|-----------|
| Oil Shock Determinism | Code change to `compute.ts` or `guardrails/` | Pre-commit |
| Energy Determinism | Code change to `energy.ts` scorer | Pre-commit |
| Energy Data Freshness | Collector changes or EIA API changes | Weekly in staging |
| Rule Consistency | Before rule is committed to `rules` table | Per rule change |
| Guardrail Correctness | Guardrail logic changes | Pre-commit |
| Health Endpoint Schema | Feature flag or health endpoint changes | Per change |

---

## Documentation Updates Required

When validation strategy changes:
- Update this document with new validation stories
- Update `/docs/replay-validation.md` to clarify scope
- Update `/docs/phase-6a-energy.md` with new validation steps
- Add new test cases to `worker/test/` as documented above

---

## Summary

**Do NOT compare frozen Oil Shock snapshots against live energy scores** as a validation gate. The comparison will diverge by design because:
- Different input metrics
- Different eras of data
- Different engines with different purposes

**DO validate each engine independently** on its own determinism, data freshness, rule consistency, and guardrail behavior. These are the meaningful signals that the engine is working correctly.

---

## References

- `scripts/replay-validate.ts` — Oil Shock determinism validation (current)
- `worker/test/fixtures/replay-windows.json` — 9 test scenarios
- `worker/test/guardrails/evaluate.test.ts` — Existing guardrail tests
- `/docs/phase-6a-energy.md` — Energy-specific implementation plan (forthcoming)
- `/docs/failure-handling.md` — Partial failure modes and recovery (forthcoming)
