# Phase 6A Canary Evidence Report

Generated at: 2026-04-27T08:32:18.507Z

## Endpoint Collection Status

✅ `/health`: HTTP 200
✅ `/api/admin/rollout-readiness`: HTTP 200
✅ `/api/admin/rollout-status`: HTTP 200
✅ `/api/admin/api-health`: HTTP 200

## Readiness Assessment

Status: **✅ READY**

✅ **Ready for 10% canary, subject to manual sign-off**

All automatic checks pass. Proceed only if:
1. All manual checks (below) are signed off
2. Team is notified and synchronized
3. You have verified rollback procedures work

⚠️ This report does not deploy anything. Setting `ENERGY_ROLLOUT_PERCENT=10` is a separate manual step.
⚠️ This report does not change rollout percentage.
⚠️ This report does not sign any gates.

## Automatic Checks (Code-Verified)

### Pre-Deploy Gates

✅ Gates: 6/6 signed off

### API Health (Phase 6A Required Feeds)

✅ System healthy: 3/3 feeds OK

### Validation Gates

✅ All validations passed: yes
   ✅ energy_data_freshness: passed
   ✅ energy_determinism: passed
   ✅ energy_guardrail_correctness: passed
   ✅ energy_rule_consistency: passed
   ✅ health_endpoint_schema: passed
   ✅ rollout_monitoring_ready: passed

### Rollout Status

- Feature: ENERGY_ROLLOUT_PERCENT
- Current percent: 0%
- Target for canary: 10%

## Feed Health Details

❌ **EIA Brent Spot** (eia_brent): UNKNOWN
   - Error rate: 0%
❌ **EIA Diesel WTI Crack Spread** (eia_diesel_wti_crack): UNKNOWN
   - Error rate: 0%
❌ **EIA Futures Curve** (eia_futures_curve): UNKNOWN
   - Error rate: 0%
❌ **EIA US Crude Inventory** (eia_inventory): UNKNOWN
   - Error rate: 0%
❌ **EIA Refinery Utilization** (eia_refinery): UNKNOWN
   - Error rate: 0%
❌ **EIA WTI Spot** (eia_wti): UNKNOWN
   - Error rate: 0%
❌ **ENTSOG EU Pipeline Flow** (enia_pipeline): UNKNOWN
   - Error rate: 0%
❌ **GIE AGSI+ EU Gas Storage** (gie_storage): UNKNOWN
   - Error rate: 0%
❌ **SEC EDGAR Impairment Filings** (sec_impairment): UNKNOWN
   - Error rate: 0%

## Service Health

- Service: oil-shock-worker
- Environment: preview
- Runtime mode: oilshock
- Status: healthy ✅
- Database: healthy (22ms)
- Config: healthy (20 thresholds)

## Manual Verification Checklist

These items require operator sign-off and cannot be automated:

⏳ **Grafana Dashboard Imported**
   Import docs/grafana-api-health-dashboard.json into Grafana and verify all panels display data correctly.
⏳ **Alert Routing Configured**
   Configure Grafana alert routing per docs/grafana-api-health-alerts.md (Slack, PagerDuty, etc.) and verify delivery.
⏳ **Staging Telemetry Verified**
   Run manual collection in staging environment, confirm metrics flowing to api_health_metrics table, and verify /api/admin/api-health returns expected data.
⏳ **Rollback Rehearsal Complete**
   Test rollback procedure: set ENERGY_ROLLOUT_PERCENT=0 in staging, verify snapshot serving resumes, confirm no data loss.
⏳ **Team Communication**
   Notify team of rollout schedule, phases, success criteria, and incident response procedures.

## Important Reminders

- ✅ This report does not deploy anything
- ✅ This report does not change `ENERGY_ROLLOUT_PERCENT`
- ✅ This report does not sign any gates
- ✅ Manual checks remain manual
- ✅ This is a read-only evidence collection tool

## Next Steps (if ready)

1. Save this report as an ops record (e.g., `docs/evidence/phase6a-canary-readiness-2026-04-25.md`)
2. Ensure all manual checks are signed off by respective owners
3. Deploy code change: set `ENERGY_ROLLOUT_PERCENT=10` in worker configuration
4. Verify `/api/admin/rollout-status` returns `phase="canary-internal"`
5. Follow daily monitoring checklist from `docs/rollout-monitoring-strategy.md`

## References

- Readiness checklist: `docs/phase-6a-rollout-readiness.md`
- Monitoring strategy: `docs/rollout-monitoring-strategy.md`
- Rollback procedure: `docs/phase-6-rollback-procedures.md`

---

## ⚠️ IMPORTANT CONTEXT: Endpoint Reliability Is Intermittent

This snapshot shows READY at 2026-04-27T08:32:18 UTC, but **the underlying endpoint reliability issue is NOT resolved**. The HTTP 503 "DNS cache overflow" failures are intermittent and continue to occur in cycles.

### Observed Failure Pattern (2026-04-26 to 2026-04-27)

| Time (UTC) | Status | Failed Endpoints |
|-----------|--------|------------------|
| 2026-04-26 17:32 | INCOMPLETE | 3/4 endpoints HTTP 503 |
| 2026-04-26 20:37 | INCOMPLETE | 3/4 endpoints HTTP 503 |
| 2026-04-26 21:01 | OK | 0/40 (sustained probe) |
| 2026-04-26 21:02 | INCOMPLETE | 3/4 endpoints HTTP 503 |
| 2026-04-26 21:29 | INCOMPLETE | 2/4 endpoints HTTP 503 |
| 2026-04-27 08:29 | OK | 0/4 (single curl) |
| 2026-04-27 08:30:05 | INCOMPLETE | 2/4 endpoints HTTP 503 |
| 2026-04-27 08:30:34 | INCOMPLETE | 2/4 endpoints HTTP 503 (different endpoints) |
| 2026-04-27 08:31 (5 runs) | MIXED | Failure rate ~40% across 20 requests |
| 2026-04-27 08:32 (10 runs) | OK | 0/40 endpoint requests failed |
| 2026-04-27 08:32:18 | READY | This snapshot |

### Key Observations

1. **Failures are not endpoint-specific**: Any of the 4 endpoints can fail; failures rotate randomly
2. **Failures are not deterministic**: Two consecutive script runs can produce different failure sets
3. **Failures cluster in time**: There are "bad" minutes (~40% failure) and "good" minutes (0% failure)
4. **Sequential single-curl rarely fails**: 60+ sequential requests with delay all returned HTTP 200
5. **Concurrent requests (Promise.all in evidence script) appear more prone to flapping**
6. **Error format is consistent**: Plaintext "DNS cache overflow" — Cloudflare edge error before Worker execution
7. **Worker code is reachable when requests succeed**: Valid JSON, healthy database (22ms), all gates signed

### Required Action Before Canary

A single READY snapshot is **not sufficient** evidence of stable endpoint reliability. Before proceeding to 10% canary:

1. Run sustained evidence capture monitoring (e.g., every 5 minutes for 1 hour) and confirm 0% failure rate
2. Or: Investigate Cloudflare-side root cause (requires Cloudflare API access, not available in this environment)
3. Or: Add retry logic with backoff in the evidence capture script to mask intermittent edge issues
4. The intermittent failures may also affect canary monitoring during rollout — readiness probes are not currently reliable
