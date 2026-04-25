# Phase 6A Energy Rollout Readiness Checklist

**Purpose**: Verify that all prerequisites are met before beginning the 10% canary phase.

**Timeline**: Completion required before Day 22 (May 2026)

This checklist separates code-checkable items (automatic) from manual verification steps (operator sign-off).

---

## Automatic Checks (Code-Verified)

✅ All automatic checks use `/api/admin/rollout-readiness` endpoint

### 1. Pre-Deploy Gates Signed Off
**Status**: Code-checkable via endpoint  
**Command**: `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://worker.example.com/api/admin/rollout-readiness`

**Pass criteria**:
```json
{
  "gates": {
    "passedCount": 6,
    "totalCount": 6,
    "allSigned": true
  }
}
```

**If blocked**: Review individual gates at `/api/admin/gate-status`, then re-sign with `/api/admin/gate-sign-off`.

---

### 2. API Health Feeds Are Healthy
**Status**: Code-checkable via endpoint  
**Feeds to verify**:
- eia_wti (EIA WTI Spot)
- eia_brent (EIA Brent Spot)
- eia_diesel_wti_crack (EIA Diesel/WTI Crack Spread)

**Pass criteria**:
```json
{
  "apiHealth": {
    "systemHealthy": true,
    "unhealthyFeeds": [],
    "totalFeeds": 3,
    "healthyFeeds": 3
  }
}
```

**If blocked**: Feeds have exceeded error rate threshold or are stale. Check `/api/admin/api-health` for details.

---

### 3. Validation Gates Are Ready
**Status**: Code-checkable via endpoint  
**Gates verified**:
- energy_determinism: 100% pass
- energy_data_freshness: < 5% variance
- rule_consistency: 100% expected deltas
- guardrail_correctness: 100% correct flags

**Pass criteria**:
```json
{
  "validation": {
    "allValidationsPassed": true,
    "readyForRollout": true
  }
}
```

**If blocked**: Run validation suite and address failures. See `docs/phase-6a-energy.md` for gate details.

---

### 4. Rollout Percentage Is Pre-Canary
**Status**: Code-checkable via endpoint  
**Pass criteria**:
```json
{
  "rolloutPercent": 0
}
```

**Why**: Ensures no energy traffic is being served yet. Canary begins when this is set to 10%.

---

## Manual Verification Steps (Operator Sign-Off)

### Tier 1: Telemetry Setup (PREREQUISITE)
**Timeline**: Must complete before Tier 2  
**Owner**: Data ops + Engineering

- [ ] **Collector Instrumentation**: Energy collector is wired to use `instrumentedFetch()` instead of `fetchJson()`
  - Reference: `docs/TELEMETRY_SETUP_GUIDE.md`
  - Verify in code: `worker/src/jobs/collectors/energy.ts` imports `instrumentedFetch`
  - Test: Run `corepack pnpm -C worker test` to confirm no regressions

- [ ] **Local Metrics Flow**: Metrics are being recorded to `api_health_metrics` table
  - Command: Start local worker: `corepack pnpm dev:worker`
  - Trigger collection: `curl -X POST http://localhost:8787/api/admin/run-poc -H "Authorization: Bearer your-token"`
  - Verify: `sqlite3 .wrangler/state/d1/DB.db "SELECT COUNT(*) FROM api_health_metrics;"`
  - Expected: count > 0

- [ ] **API Health Endpoint**: `/api/admin/api-health` returns data
  - Command: `curl http://localhost:8787/api/admin/api-health | jq .feeds | head`
  - Expected: At least 3 feeds with status "OK"

- [ ] **Staging Telemetry**: Metrics are flowing in staging environment
  - Command: SSH into staging or use Cloudflare dashboard
  - Trigger: Manual collection via admin endpoint
  - Verify: Check staging D1 has recent metrics

**Sign-off**: _____________________ (Data ops lead)  
**Date**: _____________________

---

### Tier 2: Grafana Monitoring Setup
**Timeline**: After Tier 1, before Tier 3  
**Owner**: Observability + SRE  
**Reference**: `docs/GRAFANA_SETUP_GUIDE.md`

- [ ] **Dashboard Imported**: Grafana dashboard from `docs/grafana-api-health-dashboard.json` is imported
  - Verify: All panels display data (no "No data" messages)
  - Panels include:
    - Collector error rate
    - Scorer latency
    - Guardrail flag frequency
    - Feed-specific health

- [ ] **Alert Rules Created**: 5 alert rules from `docs/grafana-api-health-alerts.md` are configured
  - Verify in Grafana: Alert → Alerting Rules
  - Rules include:
    1. Collector error rate > 5% (10 min)
    2. Scorer error rate > 2% (10 min)
    3. Database latency P95 > 200ms (5 min)
    4. Health endpoint degraded
    5. Guardrail flag spike

- [ ] **Alert Routing Tested**: Alerts route to correct channels
  - Verify: Slack notifications enabled for #eng-alerts
  - Verify: PagerDuty escalation configured
  - Test: Trigger a test alert, confirm delivery

**Sign-off**: _____________________ (SRE lead)  
**Date**: _____________________

---

### Tier 3: Team Communication & Procedures
**Timeline**: After Tier 2, before Day 22  
**Owner**: Engineering + Product + Operations

- [ ] **Rollout Schedule Announced**: Team notified of:
  - Phase 1 dates (Days 22-26): 10% canary
  - Phase 2 dates (Days 27-35): 50% expansion
  - Phase 3 dates (Days 36-42): 100% rollout
  - Phase 4 dates (Days 43-52): Stabilization

- [ ] **Success Criteria Shared**: Team understands:
  - Canary: 0 unintended rollbacks, error rate < 1%
  - Expansion: Error rate < 0.5% divergence vs snapshot
  - Full: All gates passing, 7 days clean monitoring
  - Metrics dashboard location and interpretation

- [ ] **Incident Response Runbook Created**: Team has access to:
  - Rollback procedure (set `ENERGY_ROLLOUT_PERCENT=0`)
  - Escalation path
  - Root cause investigation template
  - Communication template for production incident

**Sign-off**: _____________________ (Eng lead)  
**Date**: _____________________

---

### Tier 4: Rollback Rehearsal
**Timeline**: After Tier 3, before Day 22  
**Owner**: Engineering + SRE

- [ ] **Rollback Tested in Staging**: Procedure works end-to-end
  - Start with `ENERGY_ROLLOUT_PERCENT=10` in staging
  - Serve 10% energy, 90% snapshot
  - Then set `ENERGY_ROLLOUT_PERCENT=0`
  - Verify: All traffic reverts to snapshot serving
  - Verify: No data loss or corruption

- [ ] **Verification Complete**: Confirm:
  - Snapshots serving correctly after rollback
  - API response times normal
  - Health endpoint returns 200
  - No spike in error rates

**Sign-off**: _____________________ (SRE lead)  
**Date**: _____________________

---

## Readiness Assessment

### Run Final Verification

```bash
# 1. Check automatic items
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://worker.example.com/api/admin/rollout-readiness | jq .

# Expected output:
# {
#   "status": "ready",
#   "blockers": [],
#   "warnings": [],
#   "manualChecks": [... 5 items ...],
#   "evidence": { ... }
# }

# 2. Verify rollout status is pre-canary
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://worker.example.com/api/admin/rollout-status | jq .

# Expected output: "phase": "pre-rollout", "rolloutPercent": 0
```

### Decision Criteria

✅ **Ready to proceed to 10% canary if**:
- `GET /api/admin/rollout-readiness` returns status: "ready"
- All Tier 1-4 manual checks are signed off
- No blockers or warnings present
- Team acknowledges readiness in writing

⚠️ **Warning (can proceed with sign-off if)**:
- Status is "warning" (stale data, etc.)
- Blockers are explicitly acknowledged in writing
- Team decides risk is acceptable

❌ **Do NOT proceed if**:
- Status is "blocked"
- Any Tier 1-2 manual checks are incomplete
- Team has not signed off on all procedures

---

## What This Does NOT Do

This readiness checklist confirms:
- ✅ Code is ready for canary
- ✅ Telemetry is flowing
- ✅ Monitoring is in place
- ✅ Team procedures are documented
- ✅ Rollback is rehearsed

This does NOT:
- ❌ Change rollout percentage (manual step only)
- ❌ Deploy code (must be done separately)
- ❌ Claim production stability (monitoring period required)
- ❌ Verify live Grafana dashboards (manual verification only)
- ❌ Trigger alerts or notifications
- ❌ Modify configuration

---

## Post-Readiness: Day 22 Canary Deployment

Once readiness is confirmed:

1. **Deploy** with configuration change: `ENERGY_ROLLOUT_PERCENT=10`
2. **Verify** rollout-status endpoint returns phase: "canary-internal"
3. **Monitor** per `docs/rollout-monitoring-strategy.md` Phase 1 checklist
4. **Review** daily metrics for 5 days (Days 22-26)
5. **Decide** to expand, stabilize, or rollback

---

## References

- `docs/phase-6a-energy.md` — Full Phase 6A plan and validation gates
- `docs/rollout-monitoring-strategy.md` — Monitoring procedures by phase
- `docs/TELEMETRY_SETUP_GUIDE.md` — Wiring energy collector for metrics
- `docs/GRAFANA_SETUP_GUIDE.md` — Grafana dashboard and alert setup
- `docs/phase-6-rollback-procedures.md` — Safe rollback after migration
- `/api/admin/rollout-readiness` — Automated readiness assessment
- `/api/admin/rollout-status` — Current rollout phase and percentage
- `/api/admin/validation-status` — Validation gate results
- `/api/admin/api-health` — Per-feed health metrics
