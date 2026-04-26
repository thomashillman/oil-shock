# Phase 6A Canary Evidence Report

Generated at: 2026-04-26T17:32:28.963Z

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
