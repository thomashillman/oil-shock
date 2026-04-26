# Phase 6A Step 0B D1 Separation Operator Runbook

**Status**: Preview D1 separation and migrations complete. Live verification pending.  
**Date**: 2026-04-26  
**Latest**: Migrations (0014, 0015, 0016) applied to preview; tables verified

---

## Context

Phase 6A Step 0B (staging telemetry verification) required separating the preview D1 database from the shared production database and applying required migrations. This has been completed.

**What was done:**
- Created new preview D1 database: `f9e3848e-20e6-43f0-8b0f-4fb652572d16`
- Updated `wrangler.jsonc` env.preview to use the new database
- Applied all 16 migrations to preview database
- Verified required tables exist: pre_deploy_gates, gate_sign_off_history, api_health_metrics, api_feed_registry
- Preflight check now passes with "OPERATOR REVIEW REQUIRED" status
- No CRITICAL blockers remain

**What remains:**
1. Deploy preview worker and verify live endpoint responses
2. Run staging collection and verify `api_health_metrics` populated
3. Proceed to Grafana, alerts, comms, rollback rehearsal, and canary sign-off

---

## Current State (PR #81)

---

## Operator Checklist

### 1. Create or Identify Preview D1 Database

Using Cloudflare Dashboard or Wrangler CLI:

```bash
# Option A: List existing D1 databases
wrangler d1 list

# Option B: Create a new preview D1 database
wrangler d1 create energy_dislocation_preview

# Option C: Create a preview database with identical schema to production
# (Recommended: ensures compatibility with migrations)
wrangler d1 create energy_dislocation_preview --initial-sql=db/migrations/0001_init.sql
```

**Record the preview database ID.** It will be in the format:
```
UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 2. Update `wrangler.jsonc`

Update **ONLY** the `env.preview` section to point to the new preview database:

```jsonc
{
  // ... root config stays the same (shared database) ...
  "env": {
    "preview": {
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "energy_dislocation",
          "database_id": "YOUR_PREVIEW_DATABASE_ID_HERE"  // ← Change this
        }
      ],
      "vars": {
        // ... vars stay the same ...
      }
    },
    "production": {
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "energy_dislocation",
          "database_id": "9db64b68-6ffc-4be2-a2c6-667691a5801f"  // ← Leave unchanged
        }
      ],
      // ... rest of production config ...
    }
  }
}
```

**Critical**: 
- ✅ Update preview database ID only
- ❌ DO NOT change root database ID
- ❌ DO NOT change production database ID

### 3. Verify Configuration

```bash
# Confirm wrangler.jsonc is valid
wrangler publish --dry-run --env preview

# Check that preview points to new database
wrangler d1 list
```

### 4. Create PR with Configuration Change

Create a pull request with:
- Updated `wrangler.jsonc` (preview binding only)
- Title: `config: separate preview D1 database for Phase 6A Step 0B`
- Description: Document which preview database was chosen and why

### 5. Merge and Re-run Preflight

After merge to main:

```bash
git checkout main
git pull
corepack pnpm phase6a:d1:preflight
```

Expected result:
- Status: `ready_for_operator_review` (no CRITICAL blockers)
- Preview and production should have different database IDs
- Commands should no longer be withheld

### 6. Apply Migrations to Preview Only

If preflight passes:

```bash
wrangler d1 migrations apply energy_dislocation --env preview
```

Verify migrations were applied:

```bash
wrangler d1 execute energy_dislocation --env preview \
  --command "SELECT name FROM sqlite_master WHERE type='table' LIMIT 10;"
```

Expected tables:
- `pre_deploy_gates`
- `gate_sign_off_history`
- `api_health_metrics`
- `api_feed_registry`

### 7. Re-run Evidence Capture

```bash
ADMIN_TOKEN=<your-admin-token> \
  corepack pnpm phase6a:evidence -- \
  --base-url https://staging-worker.example.com \
  --out docs/evidence/phase6a-staging-telemetry-verification.md
```

### 8. Final PR with Evidence

Create a final PR with:
- Updated `docs/evidence/phase6a-d1-target-preflight.md` (should show `ready_for_operator_review`)
- Updated `docs/evidence/phase6a-staging-telemetry-verification.md`
- Title: `docs(phase6a): record D1 separation and staging telemetry evidence`

---

## Safety Constraints (Do Not Violate)

- ❌ Do NOT apply migrations to the shared database
- ❌ Do NOT run any production migration
- ❌ Do NOT change `ENERGY_ROLLOUT_PERCENT`
- ❌ Do NOT sign gates or start canary
- ✅ Only update preview D1 binding in `wrangler.jsonc`
- ✅ Leave root and production unchanged

---

## Next Steps After This Runbook

**Configuration & Migrations Complete:**
1. ✅ Separate preview D1 database created
2. ✅ `wrangler.jsonc` updated with preview database ID
3. ✅ Migrations applied to preview
4. ✅ PR #81 contains configuration and evidence

**Remaining work (in priority order):**
1. Deploy preview worker with updated `wrangler.jsonc`
2. Verify worker is reachable at preview URL
3. Confirm `/api/admin/api-health` and `/api/admin/rollout-readiness` respond
4. Run staging collection in preview database
5. Rerun evidence capture against live preview URL
6. Verify `api_health_metrics` has recent rows for all three Energy feeds
7. Configure Grafana dashboard
8. Configure alert routing
9. Send team communications
10. Rehearse rollback procedure
11. Obtain canary approval and deploy 10% rollout

---

## Blockers Still Outstanding Before 10% Canary

**Configuration & Migrations Complete (in PR #81):**
- [x] Separate preview D1 database created
- [x] `wrangler.jsonc` updated with preview database ID
- [x] Preflight check passes (no CRITICAL blockers)
- [x] Migrations 0014/0015/0016 applied to preview database
- [x] Tables verified: pre_deploy_gates, gate_sign_off_history, api_health_metrics, api_feed_registry

**Live Verification & Telemetry (Operator action required):**
- [ ] Preview worker deployed and reachable at live URL
- [ ] Live `/api/admin/api-health` endpoint responds successfully
- [ ] Live `/api/admin/rollout-readiness` endpoint responds successfully
- [ ] Staging collection run in preview database
- [ ] Evidence capture shows recent rows in `api_health_metrics` for all three Energy feeds (EIA, FRED, WTI)

**Pre-Canary (Requires live verification complete):**
- [ ] Grafana dashboard imported
- [ ] Alert routing configured
- [ ] Team communications sent
- [ ] Incident response runbook reviewed
- [ ] Rollback procedure rehearsed
- [ ] 10% canary approved and deployment scheduled

---

## References

- Phase 6A D1 Preflight Report: `docs/evidence/phase6a-d1-target-preflight.md`
- Phase 6A Telemetry Verification Task: `docs/phase-6a-staging-telemetry-verification-task.md`
- Current Priorities: `docs/current-priorities.md`
