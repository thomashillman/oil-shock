# Phase 6A Canary Evidence Report

Generated at: 2026-04-26T14:28:58.379Z

⚠️ **INCOMPLETE EVIDENCE COLLECTION**

Some endpoints failed to respond. Report is conservative and incomplete.

- ❌ `/health` failed - Network error: TypeError: fetch failed
- ❌ `/api/admin/rollout-readiness` failed - Network error: TypeError: fetch failed
- ❌ `/api/admin/rollout-status` failed - Network error: TypeError: fetch failed
- ❌ `/api/admin/api-health` failed - Network error: TypeError: fetch failed

## Endpoint Collection Status

❌ `/health`: network error - Network error: TypeError: fetch failed
❌ `/api/admin/rollout-readiness`: network error - Network error: TypeError: fetch failed
❌ `/api/admin/rollout-status`: network error - Network error: TypeError: fetch failed
❌ `/api/admin/api-health`: network error - Network error: TypeError: fetch failed

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
