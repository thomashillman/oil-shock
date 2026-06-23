# Phase 6 Rollback Procedures: Safe Recovery Post-Migration-0013

This document describes how to safely rollback from Macro Signals (energy engine) to Oil Shock snapshots after migration 0013 has archived the original snapshots.

## Critical Context

**Migration 0013 (2026-04-24) changed the system state:**
- Oil Shock collection is retired (no longer actively collecting)
- Oil Shock snapshots are frozen (no new writes to `signal_snapshots`)
- Oil Shock snapshots are archived in `signal_snapshots_archive_oil_shock`
- New snapshots are backfilled into `scores` table for each engine

**You cannot "rollback" Oil Shock in the traditional sense.** Instead, you revert to serving from the archived snapshot table, which contains historical (non-current) Oil Shock data.

---

## Rollback Triggers

Rollback is automatic if any of these occur during rollout:

**Error rate spike:**
```
IF collector_error_rate > 5% for 30 consecutive minutes
  OR scorer_failure_rate > 2% for 30 consecutive minutes
  THEN: Automatic rollback to ENERGY_ROLLOUT_PERCENT = 0
```

**Score divergence spike:**
```
IF p95_divergence > 0.2 (score differs by > 0.2)
  THEN: Automatic rollback to ENERGY_ROLLOUT_PERCENT = 0
```

**Manual trigger:**
```
Operations Lead: "We're seeing customer-reported issues correlated with energy engine."
Action: Manually set ENERGY_ROLLOUT_PERCENT = 0
```

---

## Safe Rollback: Immediate Actions (< 5 minutes)

### Step 1: Stop Serving Energy Scores
```bash
# In Cloudflare Workers secrets or environment:
Set ENERGY_ROLLOUT_PERCENT = 0

# Redeploy worker
corepack pnpm deploy:worker
```

### Step 2: Verify Revert
```bash
# Check health endpoint
curl https://api.oil-shock.example/health

# Expected response:
{
  "runtimeMode": "oilshock",
  "degradedComponents": [],
  "featureFlags": {
    "macroSignals": false
  }
}

# Check API response
curl https://api.oil-shock.example/api/state

# Expected: Snapshot-backed response with old data but known good structure
```

### Step 3: Notify Teams
```
[ ] Slack: #oil-shock-incidents
    "ROLLBACK: Reverted to snapshot-backed API. Investigating..."
[ ] Create incident ticket
[ ] Page on-call engineer
[ ] Notify product/ops leads
```

---

## Investigation Phase (After Rollback)

### Step 1: Identify Root Cause

**Collector failed:**
```bash
# Check EIA API status
curl https://api.eia.gov/v2/electricity/rto/region-data/

# Check collector logs
grep "collectEnergy" /logs/worker/*.log | tail -100

# Common causes:
- EIA API auth failure (API key expired)
- EIA API rate limit (5 req/min exceeded)
- Network timeout (worker → EIA connection)
```

**Scorer failed:**
```bash
# Check rule syntax
SELECT * FROM rules WHERE engine_key = "energy" AND is_active = 1;

# Check recent rule changes
SELECT * FROM git_commits WHERE file LIKE '%energy%' ORDER BY timestamp DESC LIMIT 5;

# Common causes:
- Invalid JSON in rule predicate
- Rule condition logic error
- Threshold constant changed unexpectedly
```

**Scoring divergence:**
```bash
# Check divergence data
SELECT 
  score_value, 
  confidence, 
  flags_json,
  created_at 
FROM scores 
WHERE engine_key = "energy" 
ORDER BY created_at DESC 
LIMIT 20;

# Look for:
- Sudden score jumps (> 0.2 delta)
- Confidence drops (< 0.3)
- Unexpected flags
```

**Customer reports:**
```bash
# Query customer interaction logs
grep "error\|timeout\|divergence" /logs/customer-api/*.log

# Check timestamps against energy engine changes
```

### Step 2: Fix the Issue

**If collector issue:**
```bash
# Fix: Update EIA API key or investigate API status
[ ] Get new API key from EIA
[ ] Update CLOUDFLARE_SECRETS with new key
[ ] Test collector in staging:
    corepack pnpm -C worker test -- collectors/energy.test.ts
```

**If scorer issue:**
```bash
# Fix: Correct rule syntax or logic
[ ] Review recent rule changes
[ ] Fix syntax in rules table or code
[ ] Run validation:
    corepack pnpm -C worker test -- rules/engine.test.ts
[ ] Test with dry-run endpoint:
    POST /api/admin/rules-compare
```

**If code regression:**
```bash
# Fix: Revert problematic commit
[ ] Identify commit that introduced issue
[ ] Revert:  git revert <commit-sha>
[ ] Rebuild and redeploy
```

### Step 3: Re-Validate Before Retry

```bash
# Run all gates again
corepack pnpm -C worker test

# Specific validations:
[ ] Energy determinism: 100% pass
[ ] Data freshness: < 5% variance
[ ] Rule consistency: All rules apply correctly
[ ] Guardrails: Flags correct

# Manual dry-run test
curl -X POST https://api.oil-shock.example/api/admin/rules-compare \
  -H "Content-Type: application/json" \
  -d '{
    "engineKey": "energy",
    "testMetrics": { "physicalStress": 0.65, "priceSignal": 0.35 }
  }'

# Expected: Deterministic rule adjustment delta
```

---

## After Rollback Investigation

### Decision 1: Problem Understood and Fixed?

**YES → Attempt Retry:**
```bash
[ ] Commit fix to git
[ ] Land change on main
[ ] Re-validate in staging
[ ] Re-sign pre-deploy gates
[ ] Restart rollout at Week 1 (internal canary)
[ ] File postmortem ticket for lessons learned
```

**NO → Escalate:**
```bash
[ ] Page engineering lead
[ ] Schedule emergency debugging session
[ ] Consider extended investigation period (1-2 weeks)
[ ] Do NOT retry rollout until root cause confirmed
```

---

## Data Retention During Rollback

### What to preserve:
```sql
-- Do NOT delete score_comparisons or divergence data
-- This is evidence for postmortem
SELECT * FROM score_comparisons 
WHERE engine_key = "energy"
ORDER BY created_at DESC;

-- Optionally archive divergence data for long-term analysis
INSERT INTO score_comparisons_archive
SELECT * FROM score_comparisons 
WHERE engine_key = "energy" AND created_at < now() - interval '30 days';
```

### What stays frozen:
```sql
-- Oil Shock archive remains immutable
-- signal_snapshots_archive_oil_shock is never modified

-- Scores table keeps new engine data
-- scores rows with engine_key = "energy" are preserved
```

---

## Preventing Future Rollbacks

After a rollback, implement preventive measures:

**Process:**
```
[ ] Root cause documented in ticket
[ ] Action items assigned and completed
[ ] Test case added to prevent regression
[ ] Monitoring alert threshold adjusted if needed
```

**Example: Collector API Timeout**
```
Root cause: EIA API intermittent 30s timeouts
Fix: Increase collector timeout from 10s to 30s, add retry logic
Test: Add test case that simulates timeout and verifies retry
Alert: Set timeout_count > 3 in 1 hour → alert team
```

---

## Escalation Path

**Level 1: Operational Issue (Can fix in < 1 hour)**
```
Example: EIA API rate limit exceeded
Action: Wait 5 minutes, retry collection
Escalation: None
```

**Level 2: Code Issue (Fix in < 4 hours)**
```
Example: Rule syntax error in database
Action: Fix rule, re-validate, retry rollout
Escalation: Notify engineering lead
```

**Level 3: Design Issue (Fix in 1-2 days)**
```
Example: Energy score divergence > 0.2 (fundamental scorer difference)
Action: Investigate scorer logic, compare inputs, fix discrepancy
Escalation: Page engineering lead; may need design review
```

**Level 4: Fundamental Problem (Defer to next phase)**
```
Example: EIA data source changed, incompatible with current rules
Action: Acknowledge limitation, defer energy engine to Q3
Escalation: Notify product/engineering leadership; update timeline
```

---

## Rollback Limits

**Rollback is always possible for:**
- ENERGY_ROLLOUT_PERCENT feature flag
- Individual rule changes (undo via rules table)
- Collector/scorer code (revert git commit)

**Rollback is NOT needed for:**
- Macro_releases (deferred to Phase 6B; not yet rolled out)
- BLS API (deferred to Phase 6B; not yet deployed)

**Rollback would be complex for:**
- D1 database migration (would need data recovery; rare scenario)

---

## Post-Rollback Runbook

Use this checklist after any rollback:

```markdown
## Rollback Incident: [Date/Time]

### Immediate (0-5 min)
- [ ] Set ENERGY_ROLLOUT_PERCENT = 0
- [ ] Verify revert via /health endpoint
- [ ] Notify teams in #oil-shock-incidents
- [ ] Page on-call engineer

### Investigation (5 min - 2 hours)
- [ ] Check collector logs for errors
- [ ] Review recent rule/code changes
- [ ] Check EIA API status/limits
- [ ] Analyze score divergence data
- [ ] Identify root cause

### Fix (As needed)
- [ ] Implement fix in code or database
- [ ] Re-run validation tests
- [ ] Verify fix in staging

### Re-validation (Before retry)
- [ ] All gates passing
- [ ] Dry-run tests successful
- [ ] Engineering lead approves retry

### Postmortem
- [ ] Document root cause
- [ ] Assign prevention action items
- [ ] Schedule follow-up if needed
- [ ] File ticket for lessons learned

### Retry Plan
- [ ] Restart rollout at Week 1 (canary) OR escalate
- [ ] Notify product/leadership of timeline impact
```

---

## When NOT to Rollback

**Operational degradation (but functional):**
```
Example: Scorer latency increased from 80ms to 150ms
Action: Monitor closely; alert if crosses 200ms; do NOT rollback
Reason: System still functional; investigate cause; may improve
```

**Temporary external API issue:**
```
Example: EIA API slow response (500ms)
Action: Wait for API to recover; do NOT rollback
Reason: Transient; will resolve itself in minutes
```

**Stale data flags visible:**
```
Example: 5% of runs show stale_energy_data flag
Action: Investigate collector but do NOT rollback
Reason: Expected during feed latency; guardrail working correctly
```

**Need: Immediate customer comms:**
```
Action: Prepare communications BEFORE rollback
Say: "We are reverting to a previous version while we investigate"
Do NOT say: "Energy engine is broken" (damages confidence)
```

---

## References

- `/docs/failure-handling.md` — Per-component failure modes
- `/docs/energy-rollout-strategy.md` — Rollout phases and gates
- `/docs/phase-6a-energy.md` — Energy engine implementation
- `db/migrations/0013_phase3_freeze_snapshots.sql` — Context for post-migration state
