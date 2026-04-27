# Phase 6A Canary Evidence Report

Generated at: 2026-04-27T10:34:20.495Z

⚠️ **INCOMPLETE EVIDENCE COLLECTION**

Some endpoints failed to respond. Report is conservative and incomplete.

- ❌ `/api/admin/rollout-status` failed (HTTP 503) - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON

## Endpoint Collection Status

✅ `/health`: HTTP 200
✅ `/api/admin/rollout-readiness`: HTTP 200
❌ `/api/admin/rollout-status`: HTTP 503 - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
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

✅ **EIA Brent Spot** (eia_brent): OK
   - Error rate: 0%
   - Latency P95: 6125ms
   - Last success: 2026-04-27T10:17:42.545Z
✅ **EIA Diesel WTI Crack Spread** (eia_diesel_wti_crack): OK
   - Error rate: 0%
   - Latency P95: 5999ms
   - Last success: 2026-04-27T10:17:42.545Z
❌ **EIA Futures Curve** (eia_futures_curve): UNKNOWN
   - Error rate: 0%
❌ **EIA US Crude Inventory** (eia_inventory): UNKNOWN
   - Error rate: 0%
❌ **EIA Refinery Utilization** (eia_refinery): UNKNOWN
   - Error rate: 0%
✅ **EIA WTI Spot** (eia_wti): OK
   - Error rate: 0%
   - Latency P95: 5812ms
   - Last success: 2026-04-27T10:17:42.545Z
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
- Database: healthy (13ms)
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
