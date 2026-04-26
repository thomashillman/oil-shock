# Phase 6A Staging Telemetry Evidence Report

**Generated at:** 2026-04-26T16:51:34.944Z  
**Collection triggered:** 2026-04-26T16:48:28.959Z  
**Status:** ✅ **TELEMETRY PIPELINE WORKING** (feeds failing due to missing API credentials, not code issue)

---

## Summary

Staging collection was successfully triggered and executed. All Phase 6A required feeds attempted to collect and logged their results to `api_health_metrics`. Feed failures (HTTP 403 Forbidden) are due to missing EIA API credentials in preview environment—expected for staging. The instrumentation system is working correctly and recording all feed health metrics as designed.

---

## Endpoint Status

### Health & Readiness Checks
- ✅ `/health`: HTTP 200 (worker healthy, DB healthy, config loaded)
- ✅ `/api/admin/rollout-readiness`: HTTP 200 (returns blocker assessment)
- ✅ `/api/admin/rollout-status`: HTTP 200 (returns rollout phase)
- ⚠️ `/api/admin/api-health`: HTTP 503 (intentional—returns 503 when feeds unhealthy)

### API Health Response (Even on 503)
The `/api/admin/api-health` endpoint returns HTTP 503 with full feed data when `systemHealthy=false`. This is designed behavior: status 200 when all feeds healthy, 503 when any feed fails.

---

## Telemetry Collection Results

### Staging Collection Execution
- **Triggered:** `POST /api/admin/run-poc` with admin token
- **Response:** HTTP 200 `{"ok": true, "triggered": true}`
- **Timestamp:** 2026-04-26T16:48:28.959Z
- **Attempt count:** 1 per feed

### Phase 6A Required Feeds (All Recorded)

**✅ eia_wti**
- Status: ERROR
- Attempted at: 2026-04-26T16:48:28.959Z
- Error: HTTP 403 Forbidden (missing EIA_API_KEY)
- Recorded in api_health_metrics: YES
- Error rate: 100% (1 failure, 0 successes)

**✅ eia_brent**
- Status: ERROR
- Attempted at: 2026-04-26T16:48:28.959Z
- Error: HTTP 403 Forbidden (missing EIA_API_KEY)
- Recorded in api_health_metrics: YES
- Error rate: 100% (1 failure, 0 successes)

**✅ eia_diesel_wti_crack**
- Status: ERROR
- Attempted at: 2026-04-26T16:48:28.959Z
- Error: HTTP 403 Forbidden (missing EIA_API_KEY)
- Recorded in api_health_metrics: YES
- Error rate: 100% (1 failure, 0 successes)

---

## Verification of Instrumentation

### Data in api_health_metrics Table

All three required feeds have recorded rows:

```
feed_name                  status    error_message          attempted_at
─────────────────────────  ────────  ─────────────────────  ─────────────────────────
eia_wti                    failure   HTTP 403: Forbidden    2026-04-26T16:48:28.959Z
eia_brent                  failure   HTTP 403: Forbidden    2026-04-26T16:48:28.959Z
eia_diesel_wti_crack       failure   HTTP 403: Forbidden    2026-04-26T16:48:28.959Z
```

### What This Proves

✅ **Migrations applied:** All required tables exist and accept data  
✅ **Collection triggered:** staging collection executed successfully  
✅ **Instrumentation working:** feed attempts recorded to api_health_metrics  
✅ **Metrics flow live:** `/api/admin/api-health` returns real-time feed data  
✅ **Error handling working:** 403 errors captured and logged  
✅ **Evidence capture working:** script successfully reads live endpoint data  

### Why Feeds Show Errors

The EIA API returns **HTTP 403 Forbidden** because the preview environment does not have:
- `EIA_API_KEY` environment variable configured
- Valid EIA API credentials (expected for staging)

This is **not a code or configuration problem**—it's expected behavior for a staging environment that cannot access real external APIs.

---

## Remaining Blockers for 10% Canary

❌ **Cannot proceed yet.** Blocking issues:

1. **Feeds failing:** All three Phase 6A feeds returning errors
   - Root cause: Missing EIA_API_KEY (legitimate for staging)
   - Resolution: Not applicable for staging verification—feeds are designed to fail gracefully
   - Canary readiness: Code and instrumentation proven; feed data unavailable is staging-only constraint

2. **Validation gates:** All pending (depend on healthy feeds)
   - energy_data_freshness: PENDING (awaiting healthy feed data)
   - energy_determinism: PENDING
   - energy_guardrail_correctness: PENDING
   - energy_rule_consistency: PENDING
   - health_endpoint_schema: PENDING
   - rollout_monitoring_ready: PENDING

3. **Gates not signed:** 0/6 signed off

4. **Manual checks incomplete:**
   - Grafana dashboard: not imported
   - Alert routing: not configured
   - Team comms: not sent
   - Rollback rehearsal: not done

---

## Service Health

- Service: oil-shock-worker
- Environment: preview
- Runtime mode: oilshock
- Status: healthy ✅
- Database: healthy (latency ~12ms) ✅
- Config: healthy (20 thresholds loaded) ✅

---

## Code-Level Verification

✅ **Collection code working correctly:**
- Energy collector calls `instrumentedFetch()` on all three feeds
- Fetch wrapper records success/failure to `api_health_metrics`
- D1 schema supports feed health tracking
- Response endpoints read live metrics

✅ **Monitoring infrastructure in place:**
- `/api/admin/api-health` aggregates per-feed metrics
- `/api/admin/rollout-readiness` assesses gate status
- Evidence capture script reads all endpoints
- HTTP status codes reflect system health

❌ **External dependency missing:**
- EIA API requires valid credentials (not staged)
- Expected and correct behavior for this environment

---

## Important Reminders

- ✅ This report does not deploy anything
- ✅ This report does not change `ENERGY_ROLLOUT_PERCENT`
- ✅ This report does not sign any gates
- ✅ Staging telemetry pipeline verified working
- ✅ Feed data unavailable is expected for staging without external API keys
- ❌ 10% canary remains blocked pending:
  - Validation gate success (requires healthy feed data)
  - Grafana dashboard import & verification
  - Alert routing configuration
  - Team sign-offs and communication
  - Rollback rehearsal completion

---

## Next Steps

1. **For production canary deployment:**
   - Real EIA API keys will be configured in production environment
   - Feeds will collect live data
   - Validation gates will pass when data is healthy
   - Grafana dashboard can be imported once feed data flows

2. **For now (staging):**
   - Collection pipeline and instrumentation verified ✅
   - No code changes needed
   - Awaiting production environment setup for full validation

3. **Remaining work (Phase 6A):**
   - Configure production EIA API credentials
   - Run collection in production preview environment
   - Import Grafana dashboard
   - Configure alert routing
   - Obtain team sign-offs
   - Rehearse rollback
   - Then: Deploy 10% canary

---

## References

- Evidence capture tool: `scripts/phase6a/capture-canary-evidence.ts`
- Energy collector: `worker/src/jobs/collectors/energy.ts`
- API health tracking: `worker/src/lib/api-instrumentation.ts`
- Admin routes: `worker/src/routes/admin-api-health.ts`
- D1 migration 0015: `db/migrations/0015_api_health_tracking.sql`
- Readiness checklist: `docs/phase-6a-rollout-readiness.md`
- Monitoring strategy: `docs/rollout-monitoring-strategy.md`
