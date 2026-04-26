# Phase 6A Staging Telemetry Verification

**Date**: 2026-04-26  
**Status**: ⚠️ **PARTIAL** - Configuration & migrations complete; live endpoint verification incomplete

---

## Configuration Status

✅ **Preview D1 Separation Complete**
- Preview Database ID: `f9e3848e-20e6-43f0-8b0f-4fb652572d16`
- Production Database ID: `9db64b68-6ffc-4be2-a2c6-667691a5801f`
- Preflight Status: ⚠️ OPERATOR REVIEW REQUIRED (no CRITICAL blockers)
- Configuration File: `wrangler.jsonc` updated in PR #81

---

## Migrations Applied to Preview

✅ **All 16 migrations applied successfully**

Applied to preview database `f9e3848e-20e6-43f0-8b0f-4fb652572d16`:

| Migration | Status |
|---|---|
| 0001_init.sql | ✅ |
| 0002_state_change_events.sql | ✅ |
| 0003_extend_run_evidence.sql | ✅ |
| 0004_config_thresholds.sql | ✅ |
| 0005_extend_signal_snapshots.sql | ✅ |
| 0006_promote_scoring_constants.sql | ✅ |
| 0007_snapshot_run_linkage.sql | ✅ |
| 0008_complete_config_thresholds.sql | ✅ |
| 0009_fix_evidence_group_label_constraint.sql | ✅ |
| 0010_macro_signals_stage2.sql | ✅ |
| 0011_stage3_rules_guardrails.sql | ✅ |
| 0012_stage4_new_engines.sql | ✅ |
| 0013_phase3_freeze_snapshots.sql | ✅ |
| 0014_phase6_pre_deploy_gates.sql | ✅ |
| 0015_api_health_tracking.sql | ✅ |
| 0016_add_diesel_crack_feed.sql | ✅ |

---

## Required Tables Verified

✅ **All Phase 6A tables present in preview database**

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
```

**Required tables (Phase 6A):**
- ✅ pre_deploy_gates
- ✅ gate_sign_off_history
- ✅ api_health_metrics
- ✅ api_feed_registry

**Base Oil Shock tables also present:**
- ✅ config_thresholds
- ✅ series_points
- ✅ signal_snapshots
- ✅ runs
- ✅ scores
- ✅ (and others)

---

## Live Endpoint Verification

❌ **INCOMPLETE** - Live preview worker deployment not available

Attempted to verify against `http://localhost:8787`:

| Endpoint | Status | Error |
|---|---|---|
| `/health` | ❌ | Network error: fetch failed |
| `/api/admin/rollout-readiness` | ❌ | Network error: fetch failed |
| `/api/admin/rollout-status` | ❌ | Network error: fetch failed |
| `/api/admin/api-health` | ❌ | Network error: fetch failed |

**Required for completion:**
- Deploy worker to preview environment
- Verify `/api/admin/api-health` returns 200 with recent `api_health_metrics`
- Verify `/api/admin/rollout-readiness` returns 200
- Run staging collection
- Verify `api_health_metrics` has recent rows for Energy feeds (EIA, FRED, WTI)

---

## Safety Constraints Verified

- ✅ No migrations applied to shared production database
- ✅ No `ENERGY_ROLLOUT_PERCENT` changes
- ✅ No gates signed
- ✅ No canary deployment started
- ✅ `wrangler.jsonc` production binding unchanged
- ✅ `wrangler.jsonc` root binding unchanged

---

## Next Steps

To complete Phase 6A Step 0B:

1. Deploy updated `wrangler.jsonc` to preview worker
2. Verify worker is reachable at preview URL
3. Rerun evidence capture:
   ```bash
   ADMIN_TOKEN=<token> corepack pnpm phase6a:evidence -- \
     --base-url https://<preview-url> \
     --out docs/evidence/phase6a-staging-telemetry-verification.md
   ```
4. Verify `/api/admin/api-health` shows recent metrics for all feeds
5. Run staging collection and verify population
6. Once verified, proceed to Grafana, alert routing, team comms, and canary sign-off

---

## Blockers for 10% Canary

- [ ] Live endpoint verification complete
- [ ] `api_health_metrics` populated with recent data
- [ ] Staging collection verified
- [ ] Grafana dashboard configured
- [ ] Alert routing configured
- [ ] Team notifications sent
- [ ] Rollback procedure rehearsed
- [ ] 10% canary approved
