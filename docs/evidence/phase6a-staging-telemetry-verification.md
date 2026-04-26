# Phase 6A Canary Evidence Report

Generated at: 2026-04-26T17:28:01.429Z

## Endpoint Collection Status

✅ `/health`: HTTP 200
✅ `/api/admin/rollout-readiness`: HTTP 200
✅ `/api/admin/rollout-status`: HTTP 200
✅ `/api/admin/api-health`: HTTP 200

## Readiness Assessment

Status: **❌ BLOCKED**

❌ **DO NOT PROCEED TO 10% CANARY**

Critical blockers must be resolved before rollout can proceed.

### Blockers

- ❌ Validation gates: not all gates have passed (energy_data_freshness:pending, energy_determinism:pending, energy_guardrail_correctness:pending, energy_rule_consistency:pending, health_endpoint_schema:pending, rollout_monitoring_ready:pending). Cannot proceed until all validation gates pass.
- ❌ Gates signed off: 0/6 signed. Cannot proceed until all pre-deploy gates are signed off.

## Automatic Checks (Code-Verified)

### Pre-Deploy Gates

❌ Gates: 0/6 signed off

### API Health (Phase 6A Required Feeds)

✅ System healthy: 3/3 feeds OK

### Validation Gates

❌ All validations passed: no
   ⏳ energy_data_freshness: pending
   ⏳ energy_determinism: pending
   ⏳ energy_guardrail_correctness: pending
   ⏳ energy_rule_consistency: pending
   ⏳ health_endpoint_schema: pending
   ⏳ rollout_monitoring_ready: pending

### Rollout Status

- Feature: ENERGY_ROLLOUT_PERCENT
- Current percent: 0%
- Target for canary: 10%

## Feed Health Details

✅ **EIA Brent Spot** (eia_brent): OK
   - Error rate: 7.14%
   - Latency P95: 26509ms
   - Last success: 2026-04-26T17:27:46.844Z
✅ **EIA Diesel WTI Crack Spread** (eia_diesel_wti_crack): OK
   - Error rate: 7.14%
   - Latency P95: 23824ms
   - Last success: 2026-04-26T17:27:46.844Z
❌ **EIA Futures Curve** (eia_futures_curve): UNKNOWN
   - Error rate: 0%
❌ **EIA US Crude Inventory** (eia_inventory): UNKNOWN
   - Error rate: 0%
❌ **EIA Refinery Utilization** (eia_refinery): UNKNOWN
   - Error rate: 0%
✅ **EIA WTI Spot** (eia_wti): OK
   - Error rate: 7.69%
   - Latency P95: 29518ms
   - Last success: 2026-04-26T17:27:46.844Z
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
- Database: healthy (15ms)
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
