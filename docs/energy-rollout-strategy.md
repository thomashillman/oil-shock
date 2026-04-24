# Energy Rollout Strategy: Gradual 0% → 100%

This document details the phase-by-phase rollout of the energy engine from internal testing through full production.

## Overview

Energy engine rollout happens over 4 weeks with gates at each phase. Each phase must pass before advancing to the next. If any phase fails, we rollback and investigate.

---

## Week 1: Internal Canary (0% → 10%)

**Duration**: 5 days  
**Traffic**: Internal IPs only (staging/dev environments)  
**Rollout percent**: 10%  
**Owner**: Energy engineering + observability  

### Setup
```bash
Set ENERGY_ROLLOUT_PERCENT = 10
Set INTERNAL_ONLY_ROLLOUT = true  # Restrict to internal IPs
```

### Monitoring
Watch for 5 days:
- **Collector error rate**: Target < 1% per hour
- **Scorer latency**: Target < 100ms per run
- **Guardrail flags**: Target < 5% of runs have flags
- **Score divergence**: Track delta histogram
- **No unexpected exceptions or crashes**

### Dashboard Metrics
```
Energy Collector:
  Success rate: 99.2% ✓
  Avg latency: 45ms ✓
  
Energy Scorer:
  Success rate: 100% ✓
  Avg latency: 78ms ✓
  
Score Confidence (avg): 0.72 ✓

Guardrail Flags:
  - stale_energy_data: 2% ✓
  - missing_energy_data: 0% ✓
```

### Gate Criteria

**PASS if:**
- Collector error rate < 1%
- Scorer error rate < 1%
- No unplanned exceptions
- All 5 days of monitoring complete
- No operator escalations

**FAIL if:**
- Collector errors spike (> 5% in any 1-hour window)
- Scorer crashes or times out (> 2% failure rate)
- Unexpected behavior observed
- → Rollback to ENERGY_ROLLOUT_PERCENT = 0

### Sign-Off
```
Energy team: "Internal canary passed. Ready for limited public rollout."
Operations team: "Monitoring dashboard working. Alerting configured."
Product team: "No customer impact during canary."
```

---

## Week 2: Gradual Public Rollout (10% → 50%)

**Duration**: 9 days  
**Traffic**: Public (mixed internal/external clients)  
**Rollout percent**: Ramp 10% → 20% → 35% → 50%  
**Owner**: Energy engineering + platform team  

### Ramp Schedule
```
Days 1-2: 10% traffic → energy, 90% → snapshots
  Monitor for errors, divergence
  Alert threshold: error rate > 2%

Days 3-4: 20% traffic → energy, 80% → snapshots
  Verify no divergence spike
  Verify latency acceptable

Days 5-7: 35% traffic → energy, 65% → snapshots
  Monitor customer-facing latency
  Check for any user-facing issues

Days 8-9: 50% traffic → energy, 50% → snapshots
  Collect representative sample
  Review divergence data over full 9-day window
```

### Rollback Triggers

Auto-rollback if any of these occur:
```
IF collector_error_rate > 5% for 30 consecutive minutes
  THEN: Set ENERGY_ROLLOUT_PERCENT = 0
  TRIGGER: Alert on-call team
  ACTION: Investigate and file incident

IF scorer_failure_rate > 2% for 30 consecutive minutes
  THEN: Set ENERGY_ROLLOUT_PERCENT = 0
  TRIGGER: Page on-call team
  ACTION: Investigate rule evaluation or logic error

IF score_divergence_p95 > 0.2
  THEN: Set ENERGY_ROLLOUT_PERCENT = 0
  TRIGGER: Page on-call team
  ACTION: Investigate metric sources or rule changes

IF unavoidable production incident
  THEN: Set ENERGY_ROLLOUT_PERCENT = 0
  TRIGGER: SEV alert
  ACTION: Postmortem required before re-entering rollout
```

### Monitoring Queries

**Collector Success Rate**:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN succeeded THEN 1 END) as succeeded,
  ROUND(100.0 * COUNT(CASE WHEN succeeded THEN 1 END) / COUNT(*), 2) as pct_success
FROM collector_logs
WHERE engine = "energy" AND timestamp >= now() - interval '1 hour'
```

**Scorer Execution Time**:
```sql
SELECT 
  AVG(execution_ms) as avg_latency,
  PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY execution_ms) as p95_latency,
  MAX(execution_ms) as max_latency
FROM scorer_logs
WHERE engine = "energy" AND timestamp >= now() - interval '1 hour'
```

**Score Divergence**:
```sql
SELECT 
  ABS(energy_score - baseline_score) as divergence,
  COUNT(*) as frequency
FROM score_comparisons
WHERE engine = "energy" AND timestamp >= now() - interval '24 hours'
GROUP BY divergence
ORDER BY divergence
```

### Gate Criteria

**PASS at each stage (10% → 20% → 35% → 50%) if:**
- No auto-rollback triggered
- Error rate remains < 2%
- Latency < 150ms (p95)
- Divergence < 20% (90th percentile)
- No customer complaints reported

**FAIL if:**
- Auto-rollback occurs at any stage
- Error rate persistently > 2%
- Latency > 300ms (p95)
- → Return to previous percentage or full rollback

### Sign-Off
```
Energy team: "No scoring errors observed during 50% rollout."
Platform team: "Latency acceptable for 50% mixed traffic."
Operations team: "Monitoring alert thresholds correct and firing."
Product team: "No customer impact at 50%."
```

---

## Week 3: Expand Rollout (50% → 100%)

**Duration**: 7 days  
**Traffic**: Public (all clients)  
**Rollout percent**: Ramp 50% → 75% → 100%  
**Owner**: Platform team + operations  

### Ramp Schedule
```
Days 1-3: 75% energy, 25% snapshots
  Monitor full load with majority energy
  Verify no latency degradation

Days 4-7: 100% energy, 0% snapshots
  Full production with energy engine
  Continue monitoring for 4 days stability
```

### Monitoring Focus at 100%

**Critical metrics:**
```
Energy Collector:
  - Error rate (should be < 1%)
  - Data freshness (should be recent)
  - Feed quality (consistent with phase 2)

Energy Scorer:
  - Execution time (should remain < 100ms)
  - Rule application (should be deterministic)
  - Confidence scores (should be > 0.7 for fresh data)

Overall System:
  - API latency (should be < 200ms p95)
  - No cascading failures
  - Operator dashboard shows green health
```

### Automatic Monitoring

Set up automated monitoring for the 4-day stability window:
```
Every 1 hour:
  IF collector_error_rate > 1%
    → Send warning alert to eng team
    → Flag for review in morning standup
  
  IF scorer_failure_rate > 2%
    → Page on-call immediately
    → Trigger incident response
  
  IF p95_latency > 300ms
    → Send warning alert
    → Check for unrelated infrastructure issues
  
  Every 6 hours:
    → Generate divergence report
    → Check for drift from phase 2 data
```

### Gate Criteria

**PASS if:**
- 4 full days at 100% without incident
- All metrics stable
- No unplanned rollbacks
- Operator dashboard confirms green

**FAIL if:**
- Any error rate spike > 3%
- Latency spike > 400ms
- Customer-reported issues
- → Pause at previous percentage, investigate, re-attempt

### Sign-Off
```
Engineering Lead: "Energy engine stable at 100% for 4 days."
Operations Lead: "No incidents during full rollout."
Product Lead: "Ready to deprecate snapshot API."
```

---

## Week 4: Stabilization and Decommissioning

**Duration**: Ongoing  
**Focus**: Monitor, document, prepare for Phase 6B  

### Transition Phase
```
Days 1-3:
  - Monitor energy engine in 100% production
  - Collect metrics for baseline documentation
  - Prepare operator runbooks

Days 4-7:
  - Begin planning macro_releases engine (Phase 6B)
  - Document lessons learned from energy rollout
  - Prepare 4-week grace period for snapshot deprecation
```

### Snapshot Deprecation Timeline
```
Week 4 (now):
  - Energy at 100% confirmed stable
  - Announce snapshot deprecation timeline

Week 8 (4 weeks grace):
  - Snapshot API responds with "Deprecated" header
  - Clients have 4 weeks to migrate to /api/v1/energy/state
  - Operator dashboard warns of upcoming removal

Week 12 (final):
  - Remove snapshot-backed /api/state route
  - Archived data remains in signal_snapshots_archive_oil_shock for historical query
```

### Prepare for Phase 6B
```
[ ] Energy engine stabilization confirmed (4+ weeks)
[ ] Collect historical performance data
[ ] Design macro_releases engine rollout (similar phased approach)
[ ] Schedule Phase 6B kickoff for early July 2026
```

---

## Rollback Procedure

If rollback is needed at any phase:

```bash
# Immediate action
Set ENERGY_ROLLOUT_PERCENT = 0

# Verification
GET /api/state
# Should return snapshot-backed response

GET /health
# Should show runtimeMode: "oilshock"

# Investigation
curl /api/admin/rollout-status
# Check what triggered rollback

# Incident response
[ ] Create incident ticket
[ ] Assign to engineering team
[ ] Schedule postmortem
[ ] Record failure mode in runbook
```

### After Rollback

1. **Stabilize**: Ensure no ongoing issues
2. **Root cause**: Investigate what went wrong
3. **Fix**: Address the issue in code
4. **Revalidation**: Run affected gate(s) again
5. **Retry**: Start rollout again when ready

---

## Metrics Summary

### Rollout Progress Tracking

```
Phase | Week | Start | Target | Status | Issues
------|------|-------|--------|--------|--------
1     | 1    | 0%    | 10%    | PASS   | None
2a    | 2-1  | 10%   | 20%    | PASS   | None
2b    | 2-2  | 20%   | 35%    | PASS   | None
2c    | 2-3  | 35%   | 50%    | PASS   | None
3a    | 3-1  | 50%   | 75%    | PASS   | None
3b    | 3-2  | 75%   | 100%   | PASS   | None
4     | 4+   | 100%  | -      | STABLE | Monitor
```

### Key Metrics Dashboard

Create a dashboard showing:
- Rollout percentage over time
- Collector error rate (red line at 1% threshold)
- Scorer latency (red line at 100ms threshold)
- Score divergence histogram
- Guardrail flag frequency
- Customer-reported issues (if any)

---

## References

- `/docs/phase-6a-energy.md` — Phase 6A implementation plan
- `/docs/failure-handling.md` — Graceful degradation per component
- `/docs/phase-6-rollback-procedures.md` — Detailed rollback procedures
- `/docs/pre-deploy-gates.md` — Gate sign-off requirements
