# Pre-Deploy Checklist: Phase 6A Energy Engine

**Document Status**: Living document (updated as gates are signed off)  
**Last Updated**: 2026-05-01  
**Target Deployment**: Early May 2026  

---

## Phase 6A: Energy Engine Deployment Authorization

### Overview

This checklist tracks sign-offs for all 6 pre-deploy gates required before the ENABLE_MACRO_SIGNALS feature flag can be flipped to true in production.

Gate expiration: 30 days from sign-off date. Gates must be re-validated before flag flip if they have expired.

---

## Gate 1: Energy Determinism Test Passes

**Owner**: Energy Engineering Team  
**Requirement**: Energy scorer produces identical output for identical inputs (100% consistency)  
**Test**: `corepack pnpm -C worker test -- energy.test.ts`

**Status**: ⏳ PENDING
- [ ] Determinism test implemented
- [ ] Test runs successfully (100% pass)
- [ ] Test covers multiple input scenarios
- [ ] Code reviewed by energy team

**Sign-Off**:
```
Team: Energy Engineering
Lead: [Name]
Date: [Date]
Signed at: [Timestamp]
Expires at: [Timestamp + 30 days]
Notes: [Any relevant context]
```

**✓ SIGNED OFF**
- Team: Energy Engineering
- Lead: [Awaiting]
- Date: [Awaiting]

---

## Gate 2: Energy Data Freshness < 5% Variance

**Owner**: Data Quality Team  
**Requirement**: Collector produces consistent data across runs (variance < 5%)  
**Test**: 7+ days of monitoring in staging environment

**Status**: ⏳ PENDING (monitoring period not yet complete)
- [ ] Collector running for 7+ days in staging
- [ ] EIA API connectivity confirmed
- [ ] Data variance calculated: [___]%
- [ ] No data loss or corruption observed
- [ ] Metadata (timestamps, flags) consistent

**Observation Window**: [Start date] - [End date]

**Sign-Off**:
```
Team: Data Quality
Lead: [Name]
Date: [Date]
Signed at: [Timestamp]
Expires at: [Timestamp + 30 days]
Notes: Variance: [_]%, freshness flags correct
```

**✓ SIGNED OFF**
- Team: Data Quality
- Lead: [Awaiting]
- Date: [Awaiting]

---

## Gate 3: Energy Rule Consistency

**Owner**: Rules Team  
**Requirement**: Rules adjust scores correctly and deterministically  
**Test**: `/api/admin/rules-compare` endpoint + manual validation

**Status**: ⏳ PENDING
- [ ] All existing energy rules loaded into database
- [ ] Dry-run tests executed for each rule
- [ ] Score deltas match expected adjustments
- [ ] Rule application order verified
- [ ] No rule conflicts or overrides

**Test Results Summary**:
```
Rule: energy.confirmation.spread_widening
  Expected delta: +0.04
  Actual delta: +0.04 ✓

[More rules...]
```

**Sign-Off**:
```
Team: Rules Team
Lead: [Name]
Date: [Date]
Signed at: [Timestamp]
Expires at: [Timestamp + 30 days]
Notes: All [N] energy rules tested and correct
```

**✓ SIGNED OFF**
- Team: Rules Team
- Lead: [Awaiting]
- Date: [Awaiting]

---

## Gate 4: Energy Guardrail Correctness

**Owner**: Data Quality Team  
**Requirement**: Guardrails correctly flag stale/missing data  
**Test**: `corepack pnpm -C worker test -- guardrails/evaluate.test.ts`

**Status**: ⏳ PENDING
- [ ] Guardrail tests run and pass
- [ ] Stale data flags fire correctly (> freshness threshold)
- [ ] Missing data flags fire correctly (feed not present)
- [ ] Flag combinations handled correctly
- [ ] Confidence degradation works as expected

**Test Summary**:
```
Test: Fresh data → no stale flags: ✓ PASS
Test: Stale data (> 8 days) → stale flag: ✓ PASS
Test: Missing feed → missing flag: ✓ PASS
Test: Stale + missing → both flags: ✓ PASS
Overall: 4/4 tests pass ✓
```

**Sign-Off**:
```
Team: Data Quality
Lead: [Name]
Date: [Date]
Signed at: [Timestamp]
Expires at: [Timestamp + 30 days]
Notes: All guardrail tests passing
```

**✓ SIGNED OFF**
- Team: Data Quality
- Lead: [Awaiting]
- Date: [Awaiting]

---

## Gate 5: Health Endpoint Schema Backward Compatible

**Owner**: Platform Team  
**Requirement**: Health endpoint includes new fields but doesn't break existing consumers  
**Test**: `corepack pnpm -C worker test -- routes/health.test.ts`

**Status**: ⏳ PENDING
- [ ] New fields (`runtimeMode`, `degradedComponents`) added
- [ ] Schema backward compatible (no breaking changes)
- [ ] Existing fields unchanged
- [ ] Tests passing
- [ ] Deprecation headers ready (for future snapshot removal)

**Schema Summary**:
```
GET /health

Response (new):
{
  "ok": true,
  "status": "healthy",
  "runtimeMode": "macro-signals",  // NEW (optional for backward compat)
  "degradedComponents": [],         // NEW (optional for backward compat)
  "dependencies": {...},            // EXISTING (unchanged)
  "timestamp": "2026-05-01T14:30:00Z"
}

Backward compatibility: ✓ Old clients ignore new fields
```

**Sign-Off**:
```
Team: Platform Team
Lead: [Name]
Date: [Date]
Signed at: [Timestamp]
Expires at: [Timestamp + 30 days]
Notes: Schema changes backward compatible
```

**✓ SIGNED OFF**
- Team: Platform Team
- Lead: [Awaiting]
- Date: [Awaiting]

---

## Gate 6: Rollout Monitoring Ready

**Owner**: Observability/SRE Team  
**Requirement**: Observability dashboard configured and alerting active  
**Test**: Manual verification + dashboard deployment

**Status**: ⏳ PENDING
- [ ] Grafana dashboard created
- [ ] Metrics queries configured:
  - [ ] Collector error rate
  - [ ] Scorer latency (p50, p95)
  - [ ] Guardrail flag frequency
  - [ ] Score divergence histogram
- [ ] Alert thresholds set:
  - [ ] Error rate > 1% → warning
  - [ ] Error rate > 5% → critical
  - [ ] Latency > 100ms → warning
  - [ ] Latency > 200ms → critical
- [ ] On-call team trained on dashboard
- [ ] Runbook links included in alerts

**Dashboard Summary**:
```
Dashboard URL: [https://...]
Panels:
  1. Collector Success Rate (target: > 99%)
  2. Scorer Latency (target: < 100ms)
  3. Guardrail Flags (target: < 5%)
  4. Score Divergence (track histogram)

Alerts Configured:
  1. Energy Collector Errors > 1% per hour
  2. Energy Scorer Failures > 2% per hour
  3. Latency > 200ms (p95)
```

**Sign-Off**:
```
Team: Observability/SRE
Lead: [Name]
Date: [Date]
Signed at: [Timestamp]
Expires at: [Timestamp + 30 days]
Notes: Dashboard live and team trained
```

**✓ SIGNED OFF**
- Team: Observability/SRE
- Lead: [Awaiting]
- Date: [Awaiting]

---

## Production Deployment Authorization

### Engineering Lead Sign-Off

**All 6 gates passing?** [ ] YES [ ] NO

**If NO**: Which gates are blocking? [List]

```
I, [Engineering Lead], have verified that all 6 pre-deploy gates are passing
and the system is ready for production deployment.

Name: [_______________]
Date: [_______________]
Time: [_______________]
Signature: [_______________]
```

### Operations Lead Sign-Off

**Operational readiness confirmed?** [ ] YES [ ] NO

```
I, [Operations Lead], have verified that:
- [ ] Runbooks reviewed and tested
- [ ] On-call team briefed on energy engine
- [ ] Rollback procedure validated
- [ ] Monitoring dashboard operational
- [ ] Communication plan ready

Name: [_______________]
Date: [_______________]
Time: [_______________]
Signature: [_______________]
```

### Product Lead Sign-Off

**Business readiness confirmed?** [ ] YES [ ] NO

```
I, [Product Lead], have verified that:
- [ ] Stakeholders notified of deployment
- [ ] Customer communication ready
- [ ] Success criteria defined
- [ ] Escalation path documented

Name: [_______________]
Date: [_______________]
Time: [_______________]
Signature: [_______________]
```

---

## Production Deployment Record

**Date Approved**: [Date]  
**Time Approved**: [Time]  
**Approved By**: [Engineering Lead], [Operations Lead], [Product Lead]  

**Feature Flag Change**:
```bash
ENABLE_MACRO_SIGNALS: false → true
ENERGY_ROLLOUT_PERCENT: 0 → 10 (Week 1 canary)
```

**Deployed By**: [Name]  
**Deployment Timestamp**: [ISO 8601]  
**Git Commit SHA**: [SHA]  

**Rollout Timeline**:
```
Week 1: 10% (internal canary)
Week 2: 10% → 50% (gradual public rollout)
Week 3: 50% → 100% (full production)
Week 4: 100% (stabilization, prepare Phase 6B)
```

---

## Gate Re-Validation (After 30 Days)

If any gate expires and needs re-validation:

**Gate to Re-Validate**: [Gate name]  
**Reason for Re-Validation**: [ ] Expiration [ ] Code change [ ] Manual request  

**Re-Validation Results**:
```
Status: [ ] PASS [ ] FAIL
Notes: [_______________]

If FAIL: What changed?
[_______________]

Action Required:
[ ] Fix code/config
[ ] Extend sign-off timeline
[ ] Escalate to engineering lead
```

**Re-Validation Sign-Off**:
```
Team: [Team name]
Lead: [Name]
Date: [Date]
Notes: [Gate re-validated and passing]
```

---

## Incident Log (During Rollout)

Use this section to record any issues during rollout:

```
### Incident #1: [Date/Time]
Severity: [ ] Warning [ ] Critical
Description: [_______________]
Mitigation: [_______________]
Status: [ ] Resolved [ ] Pending
```

---

## Postmortem / Lessons Learned

After successful deployment, record lessons learned:

```
### What Went Well
- [_______________]
- [_______________]

### What Could Be Better
- [_______________]
- [_______________]

### Action Items
- [ ] [_______________] — [Owner]
- [ ] [_______________] — [Owner]
```

---

## Document History

| Date | Updated By | Change |
|------|-----------|--------|
| 2026-05-01 | [Name] | Created initial checklist |
| [Date] | [Name] | [Change description] |

---

## References

- `/docs/phase-6a-energy.md` — Phase 6A implementation plan
- `/docs/validation-strategy.md` — What we validate
- `/docs/pre-deploy-gates.md` — Gate system design
- `/docs/energy-rollout-strategy.md` — Gradual rollout procedure
- `/docs/failure-handling.md` — Component failure modes
- `/docs/phase-6-rollback-procedures.md` — Safe rollback
