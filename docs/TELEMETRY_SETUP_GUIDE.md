# Telemetry Setup Guide: API Health Metrics Emission

**Step 0** before Grafana setup: Ensure API health telemetry is being emitted and recorded to D1.

Without this step, the Grafana dashboard will have no data to display.

---

## Current State (as of 2026-04-25)

**Code-Complete in main**:
- ✅ D1 schema exists: `api_health_metrics` and `api_feed_registry` tables (migration 0015, 0016)
- ✅ Helper library exists: `worker/src/lib/api-instrumentation.ts` with `instrumentedFetch()`
- ✅ **Energy collector already wired** to use `instrumentedFetch()` (`worker/src/jobs/collectors/energy.ts`)
- ✅ All 3 EIA feeds instrumented (WTI, Brent, Diesel/WTI Crack)
- ✅ 8 feeds pre-seeded in `api_feed_registry`

**Live-Operator Verification Required**:
- [ ] Run staging collection and verify metrics recorded to `api_health_metrics`
- [ ] Confirm `/api/admin/api-health` returns live data in staging
- [ ] Verify telemetry flowing in staging environment

---

## Step 0a: Energy Collector Wiring (COMPLETE)

**Status**: ✅ Already merged to main

The energy collector is the active collector during Phase 1 canary and is already instrumented.

### File: `worker/src/jobs/collectors/energy.ts`

**Current implementation** (merged to main):
```typescript
import { instrumentedFetch } from "../../lib/api-instrumentation";

// All three EIA feeds are instrumented:
const [wti, brent, diesel] = await Promise.all([
  fetchLatestSeriesValue(env, "RWTC", "eia_wti"),
  fetchLatestSeriesValue(env, "RBRTE", "eia_brent"),
  fetchLatestSeriesValue(env, "EER_EPD2F_PF4_RGC_DPG", "eia_diesel_wti_crack")
]);

// Within fetchLatestSeriesValue:
const response = await instrumentedFetch<EiaResponse>(
  env,
  url.toString(),
  feedName,          // 'eia_wti', 'eia_brent', or 'eia_diesel_wti_crack'
  "EIA",             // provider
  {
    timeout: 30000,
    retries: 2,
    backoffMs: 125,
    rateLimitDelayMs: 125
  }
);
```

### What This Means

- ✅ All three EIA feeds are instrumented with automatic health metric recording
- ✅ Metrics are recorded to `api_health_metrics` table automatically
- ✅ No additional code changes needed
- ✅ Function signatures and error handling remain unchanged
- ✅ Return values remain unchanged

---

## Step 0b: Live-Operator Verification (STAGING)

The collector code is ready. Verify it works in staging before canary.

### 1. Run Staging Collection

Trigger a collection run in staging environment:

```bash
# Option 1: Via manual admin endpoint
POST https://staging-worker.example.com/api/admin/run-poc \
  -H "Authorization: Bearer your-admin-token"

# Option 2: Via scheduled collection (next automatic run)
# Collection normally runs on schedule (see CLAUDE.md for cron settings)
```

### 2. Verify Metrics in `/api/admin/api-health`

```bash
# Check the health endpoint returns live data
curl https://staging-worker.example.com/api/admin/api-health \
  -H "Authorization: Bearer your-admin-token" | jq .

# Expected: systemHealthy should be true or degraded, feeds should include:
# - eia_wti (EIA WTI Spot)
# - eia_brent (EIA Brent Spot)  
# - eia_diesel_wti_crack (EIA Diesel/WTI Crack Spread)
```

### 3. Run Evidence Capture Tool

Use the Phase 6A evidence capture tool to verify all endpoints:

```bash
corepack pnpm phase6a:evidence -- \
  --base-url https://staging-worker.example.com \
  --out docs/evidence/phase6a-telemetry-staging-YYYY-MM-DD.md

# Review the report:
# - Check "Endpoint Collection Status" (all 4 endpoints should show HTTP 200)
# - Check "API Health" section (all 3 Energy feeds should show status "OK")
# - Check overall status (should be "ready" or "warning", not "blocked")
```

### Troubleshooting

If metrics aren't appearing:

1. Verify collection was triggered (check staging logs)
2. Confirm energy collector is using `instrumentedFetch()` (it should be from main)
3. Run evidence capture tool to see detailed endpoint responses
4. Check `/api/admin/api-health` directly for error details

---

## Step 0c: Expected API Health Response (REFERENCE)

Once metrics are being recorded, `/api/admin/api-health` returns:

```json
{
  "generatedAt": "2026-04-25T14:35:00.000Z",
  "systemHealthy": true,
  "unhealthyFeeds": [],
  "feeds": [
    {
      "feedName": "eia_wti",
      "provider": "EIA",
      "displayName": "EIA WTI Spot",
      "status": "OK",
      "latencyP95Ms": 847,
      "errorRatePct": 0,
      "lastSuccessfulAt": "2026-04-25T14:30:00.000Z",
      "lastAttemptedAt": "2026-04-25T14:30:00.000Z",
      "attemptCount1h": 60,
      "successCount1h": 59,
      "failureCount1h": 1,
      "timeoutCount1h": 0
    },
    {
      "feedName": "eia_brent",
      "provider": "EIA",
      "displayName": "EIA Brent Spot",
      "status": "OK",
      "latencyP95Ms": 923,
      "errorRatePct": 0,
      "lastSuccessfulAt": "2026-04-25T14:30:00.000Z",
      "lastAttemptedAt": "2026-04-25T14:30:00.000Z",
      "attemptCount1h": 60,
      "successCount1h": 60,
      "failureCount1h": 0,
      "timeoutCount1h": 0
    },
    {
      "feedName": "eia_diesel_wti_crack",
      "provider": "EIA",
      "displayName": "EIA Diesel/WTI Crack Spread",
      "status": "OK",
      "latencyP95Ms": 891,
      "errorRatePct": 0,
      "lastSuccessfulAt": "2026-04-25T14:30:00.000Z",
      "lastAttemptedAt": "2026-04-25T14:30:00.000Z",
      "attemptCount1h": 60,
      "successCount1h": 60,
      "failureCount1h": 0,
      "timeoutCount1h": 0
    }
  ],
  "summary": {
    "totalFeeds": 8,
    "healthyFeeds": 3,
    "degradedFeeds": 0,
    "downFeeds": 0
  }
}
```

**Key items to check**:
- ✅ All 3 Energy feeds present and status "OK"
- ✅ No feeds in "unhealthyFeeds" array
- ✅ systemHealthy is true
- ✅ Each feed has recent `lastSuccessfulAt` timestamp
- ✅ Error rates are low or zero
- ✅ Attempt counts show feed is actively being collected

---

## Step 0d: Additional Collectors (FUTURE)

Once Energy telemetry is verified stable, additional collectors could be wired:

- **ENTSOG Pipeline** (Phase 6B)
- **GIE Storage** (Phase 6B)
- **SEC EDGAR** (Phase 6B)
- **Macro Releases / BLS CPI** (Phase 6B, readiness complete)

All future collectors will follow the same `instrumentedFetch()` pattern. Start with Energy first (active during Phase 1 canary).

---

## Step 0e: Pre-Canary Verification (STAGING, before Day 22)

Before deploying ENERGY_ROLLOUT_PERCENT=10:

1. **Run collection in staging** (via admin endpoint or scheduled run)
2. **Verify `/api/admin/api-health`** returns live Energy feed metrics
3. **Run evidence capture tool**:
   ```bash
   corepack pnpm phase6a:evidence -- \
     --base-url https://staging-worker.example.com
   ```
4. **Review the generated report** for status (ready/warning/blocked)
5. **Address any issues** before proceeding to canary

Reference: `docs/phase-6a-staging-telemetry-verification-task.md` for complete verification workflow.

---

## Troubleshooting

### No metrics appearing in api_health_metrics table

**Possible causes**:
1. Collectors still using `fetchJson()` instead of `instrumentedFetch()`
2. D1 migration 0015 not applied
3. API call failed before reaching the collector code

**Debug steps**:
```bash
# 1. Check table exists
SELECT COUNT(*) FROM api_health_metrics;

# 2. Check if recordApiHealthMetric is being called
# Add logging to worker output:
# Look for "Failed to record API health metric" in logs

# 3. Verify migration was applied
SELECT name FROM sqlite_master WHERE type='table' AND name='api_health_metrics';

# 4. Check if collectors are being invoked
# Look for collection start/end logs
```

### Metrics recorded but endpoint returns empty feeds array

**Possible cause**: api_feed_registry not seeded or feeds disabled

**Debug steps**:
```bash
# Check registry
SELECT COUNT(*) as enabled_feeds FROM api_feed_registry WHERE enabled = 1;
# Expected: 8

# Check specific feed
SELECT * FROM api_feed_registry WHERE feed_name = 'eia_wti';
# Expected: enabled = 1
```

### Grafana dashboard still shows "No data"

**Possible cause**: Data source query error or data source not connected to D1

**Debug steps**:
1. In Grafana, go to Explore
2. Run manual query:
   ```sql
   SELECT COUNT(*) FROM api_health_metrics;
   ```
3. Verify data source is connected to same D1 database as worker
4. Check if any data exists:
   ```sql
   SELECT COUNT(*) FROM api_health_metrics;
   # Should return > 0 after collectors have run
   ```

---

## Verification Checklist

**Code-Complete** (no action needed, already in main):
- [x] Energy collector wired to use `instrumentedFetch()`
- [x] D1 schema and endpoints implemented
- [x] API health tracking library complete
- [x] Tests passing (140+ tests in `worker/test/phase6a/`)

**Live-Operator Verification** (before Day 22 canary):
- [ ] Staging collection run triggered successfully
- [ ] Metrics recorded to D1 `api_health_metrics` table
- [ ] `/api/admin/api-health` returns live Energy feed data
- [ ] Evidence capture tool generates a "ready" or "warning" report (not "blocked")
- [ ] All 3 Energy feeds show status "OK" in health endpoint
- [ ] Team knows telemetry is live and working

---

## Next Steps

Once telemetry is verified flowing:

→ **Proceed to Step 1**: Import Grafana dashboard (docs/GRAFANA_SETUP_GUIDE.md)

---

## Reference

- `worker/src/lib/api-instrumentation.ts` - instrumentedFetch() and recording functions
- `db/migrations/0015_api_health_tracking.sql` - Schema (api_health_metrics, api_feed_registry)
- `worker/src/routes/admin-api-health.ts` - Health endpoint implementation
- `docs/rollout-monitoring-strategy.md` - Why we need this telemetry
