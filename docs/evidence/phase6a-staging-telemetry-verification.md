# Phase 6A Canary Evidence Report

Generated at: 2026-04-27T10:51:19.314Z

⚠️ **INCOMPLETE EVIDENCE COLLECTION**

Some endpoints failed to respond. Report is conservative and incomplete.

- ❌ `/health` failed (HTTP 503) - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
- ❌ `/api/admin/rollout-readiness` failed (HTTP 503) - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
- ❌ `/api/admin/rollout-status` failed (HTTP 503) - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON

## Endpoint Collection Status

❌ `/health`: HTTP 503 - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
❌ `/api/admin/rollout-readiness`: HTTP 503 - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
❌ `/api/admin/rollout-status`: HTTP 503 - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
✅ `/api/admin/api-health`: HTTP 200

## Readiness Assessment

Status: **❌ INCOMPLETE**

❌ **DO NOT PROCEED TO 10% CANARY**

Evidence collection is incomplete. Required endpoints failed to respond. Resolve all endpoint failures before proceeding.

## Feed Health Details

✅ **EIA Brent Spot** (eia_brent): OK
   - Error rate: 0%
   - Latency P95: 17244ms
   - Last success: 2026-04-27T10:38:36.531Z
✅ **EIA Diesel WTI Crack Spread** (eia_diesel_wti_crack): OK
   - Error rate: 0%
   - Latency P95: 17408ms
   - Last success: 2026-04-27T10:38:36.531Z
❌ **EIA Futures Curve** (eia_futures_curve): UNKNOWN
   - Error rate: 0%
❌ **EIA US Crude Inventory** (eia_inventory): UNKNOWN
   - Error rate: 0%
❌ **EIA Refinery Utilization** (eia_refinery): UNKNOWN
   - Error rate: 0%
✅ **EIA WTI Spot** (eia_wti): OK
   - Error rate: 0%
   - Latency P95: 17310ms
   - Last success: 2026-04-27T10:38:36.531Z
❌ **ENTSOG EU Pipeline Flow** (enia_pipeline): UNKNOWN
   - Error rate: 0%
❌ **GIE AGSI+ EU Gas Storage** (gie_storage): UNKNOWN
   - Error rate: 0%
❌ **SEC EDGAR Impairment Filings** (sec_impairment): UNKNOWN
   - Error rate: 0%

## Important Reminders

- ✅ This report does not deploy anything
- ✅ This report does not change `ENERGY_ROLLOUT_PERCENT`
- ✅ This report does not sign any gates
- ✅ Manual checks remain manual
- ✅ This is a read-only evidence collection tool

## References

- Readiness checklist: `docs/phase-6a-rollout-readiness.md`
- Monitoring strategy: `docs/rollout-monitoring-strategy.md`
- Rollback procedure: `docs/phase-6-rollback-procedures.md`
