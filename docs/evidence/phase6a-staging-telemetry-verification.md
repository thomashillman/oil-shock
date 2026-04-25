# Phase 6A Canary Evidence Report

Generated at: 2026-04-25T22:28:12.249Z

Staging worker: `https://claude-verify-phase6a-st-6f64-energy-dislocation-engine-preview.tj-hillman.workers.dev`
(Cloudflare Workers preview deployment from PR #79, commit 8a25c8e)

---

## Endpoint Collection Status

✅ `/health`: HTTP 200  
❌ `/api/admin/rollout-readiness`: HTTP 500  
✅ `/api/admin/rollout-status`: HTTP 200  
❌ `/api/admin/api-health`: HTTP 500  

---

## Readiness Assessment

Status: **❌ BLOCKED**

❌ **DO NOT PROCEED TO 10% CANARY**

Critical blockers must be resolved before rollout can proceed.

### Blockers

- ❌ Failed to evaluate readiness: error gathering evidence
- ❌ `/api/admin/api-health` returns HTTP 500 — D1 telemetry tables not present in staging

### Root Cause: D1 Migrations Not Applied

Direct API probing confirmed:

```
GET /api/admin/validation-status
→ D1_ERROR: no such table: pre_deploy_gates: SQLITE_ERROR
```

Migrations **0014** (`pre_deploy_gates`), **0015** (`api_health_metrics` + `api_feed_registry`), and **0016** (`add_diesel_crack_feed`) have not been applied to the preview D1 database (`9db64b68-6ffc-4be2-a2c6-667691a5801f`).

Without these tables the following are all non-functional in staging:
- `/api/admin/api-health` (requires `api_health_metrics`, `api_feed_registry`)
- `/api/admin/rollout-readiness` (requires `pre_deploy_gates`, `api_health_metrics`)
- `/api/admin/gate-status` (requires `pre_deploy_gates`)
- `/api/admin/validation-status` (requires `pre_deploy_gates`)

---

## Service Health

- Service: oil-shock-worker
- Environment: local
- Runtime mode: oilshock
- Status: healthy ✅
- Database: healthy (109ms)
- Config: healthy (20 thresholds)

---

## Rollout Status

```json
{
  "feature": "ENERGY_ROLLOUT_PERCENT",
  "rolloutPercent": 0,
  "phase": "pre-rollout",
  "description": "Energy engine not deployed",
  "timestamp": "2026-04-25T22:27:21.892Z"
}
```

`ENERGY_ROLLOUT_PERCENT` is 0 ✅ — canary has not started.

---

## Code-Complete Prerequisites (confirmed against main)

All code-complete items were independently verified against the local repo:

| Item | Status |
|------|--------|
| Energy collector uses `instrumentedFetch` (`energy.ts` lines 4, 52) | ✅ |
| Migrations 0015 + 0016 present in `db/migrations/` | ✅ |
| `/api/admin/api-health` route implemented | ✅ |
| `/api/admin/rollout-readiness` route implemented | ✅ |
| `/api/admin/rollout-status` route implemented | ✅ |
| `corepack pnpm -C worker typecheck` | ✅ clean |
| `corepack pnpm phase6a:evidence:test` (27/27 pass) | ✅ |
| `corepack pnpm docs:check` | ✅ |

---

## Required Action to Unblock

An operator with Cloudflare credentials must apply pending D1 migrations to the preview database:

```bash
# Apply all pending migrations to the preview D1 database
wrangler d1 migrations apply energy_dislocation --env preview

# Or to apply a specific migration:
wrangler d1 execute energy_dislocation --env preview \
  --file db/migrations/0014_phase6_pre_deploy_gates.sql
wrangler d1 execute energy_dislocation --env preview \
  --file db/migrations/0015_api_health_tracking.sql
wrangler d1 execute energy_dislocation --env preview \
  --file db/migrations/0016_add_diesel_crack_feed.sql
```

After applying migrations, re-run this tool:

```bash
ADMIN_TOKEN=<token> \
  corepack pnpm phase6a:evidence -- \
  --base-url https://claude-verify-phase6a-st-6f64-energy-dislocation-engine-preview.tj-hillman.workers.dev \
  --out docs/evidence/phase6a-staging-telemetry-verification.md
```

---

## Remaining Steps Before 10% Canary

- [ ] **BLOCKER**: Apply D1 migrations 0014/0015/0016 to preview database
- [ ] Re-run evidence capture and confirm status is "ready" or "warning"
- [ ] Run staging collection and verify `api_health_metrics` records rows for `eia_wti`, `eia_brent`, `eia_diesel_wti_crack`
- [ ] Confirm `/api/admin/api-health` returns live Energy feed data
- [ ] Step 1: Import Grafana dashboard, configure 5 alert rules
- [ ] Step 2: Team comms, incident runbook
- [ ] Step 3: Rollback rehearsal

---

## Important Reminders

- ✅ This report does not deploy anything
- ✅ This report does not change `ENERGY_ROLLOUT_PERCENT`
- ✅ This report does not sign any gates
- ✅ Manual checks remain manual

---

## References

- `docs/phase-6a-rollout-readiness.md` — full readiness checklist
- `docs/TELEMETRY_SETUP_GUIDE.md` — telemetry setup and verification
- `docs/rollout-monitoring-strategy.md` — monitoring procedures
- `docs/phase-6-rollback-procedures.md` — rollback procedures
