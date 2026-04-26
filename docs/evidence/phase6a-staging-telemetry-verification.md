# Phase 6A Canary Evidence Report

Generated at: 2026-04-26T21:29:10.648Z

⚠️ **INCOMPLETE EVIDENCE COLLECTION**

Some endpoints failed to respond. Report is conservative and incomplete.

- ❌ `/health` failed (HTTP 503) - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
- ❌ `/api/admin/rollout-readiness` failed (HTTP 503) - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON

## Endpoint Collection Status

❌ `/health`: HTTP 503 - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
❌ `/api/admin/rollout-readiness`: HTTP 503 - Failed to parse JSON response: SyntaxError: Unexpected token 'D', "DNS cache overflow" is not valid JSON
✅ `/api/admin/rollout-status`: HTTP 200
✅ `/api/admin/api-health`: HTTP 200

## Readiness Assessment

Status: **❌ BLOCKED**

❌ **DO NOT PROCEED TO 10% CANARY**

Evidence collection is incomplete. Some required endpoints failed to respond.

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

## Important Reminders

- ✅ This report does not deploy anything
- ✅ This report does not change `ENERGY_ROLLOUT_PERCENT`
- ✅ This report does not sign any gates
- ✅ Manual checks remain manual
- ✅ This is a read-only evidence collection tool

## Next Steps (Once Evidence Is Complete)

Do not proceed until:
1. All four required endpoints return HTTP 200 with valid JSON:
   - `/health`
   - `/api/admin/rollout-readiness`
   - `/api/admin/rollout-status`
   - `/api/admin/api-health`
2. Fresh evidence capture shows Status: READY
3. All manual checks are signed off

## References

- Readiness checklist: `docs/phase-6a-rollout-readiness.md`
- Monitoring strategy: `docs/rollout-monitoring-strategy.md`
- Rollback procedure: `docs/phase-6-rollback-procedures.md`
