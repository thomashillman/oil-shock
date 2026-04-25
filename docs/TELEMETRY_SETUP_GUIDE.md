# Telemetry Setup Guide: API Health Metrics Emission

**Step 0** before Grafana setup: Ensure API health telemetry is being emitted and recorded to D1.

Without this step, the Grafana dashboard will have no data to display.

---

## Current State

**Infrastructure Ready**:
- ✅ D1 schema exists: `api_health_metrics` and `api_feed_registry` tables
- ✅ Helper library exists: `worker/src/lib/api-instrumentation.ts` with `instrumentedFetch()`
- ✅ 8 feeds pre-seeded in `api_feed_registry`

**Missing**:
- ❌ Collectors NOT YET wired to use `instrumentedFetch()`
- ❌ No metrics being recorded to `api_health_metrics` table
- ❌ Grafana dashboard will be empty without this

---

## Step 0a: Wire Energy Collector (Canary)

Start with the energy collector as a proof-of-concept. This is the active collector during Phase 1 canary.

### File: `worker/src/jobs/collectors/energy.ts`

**Current state** (uses `fetchJson`):
```typescript
import { fetchJson } from "../../lib/http-client";

const spread = await fetchJson<EiaResponse>(wtiUrl, {
  timeout: 30000,
  retries: 2,
  backoffMs: 125,
  rateLimitDelayMs: 125
});
```

**Change to** (uses `instrumentedFetch`):
```typescript
import { instrumentedFetch } from "../../lib/api-instrumentation";

const spread = await instrumentedFetch<EiaResponse>(
  env,
  wtiUrl,
  'eia_wti',           // feed_name from api_feed_registry
  'EIA',               // provider from api_feed_registry
  {
    timeout: 30000,
    retries: 2,
    backoffMs: 125,
    rateLimitDelayMs: 125
  }
);
```

### Required Changes in energy.ts

Find all `fetchJson` calls and replace with `instrumentedFetch`. There should be 3 calls for:

1. **EIA WTI Spread** (wtiUrl):
   ```typescript
   const spread = await instrumentedFetch<EiaResponse>(
     env, wtiUrl, 'eia_wti', 'EIA', { ... }
   );
   ```

2. **EIA Brent Spread** (brentUrl):
   ```typescript
   const spread = await instrumentedFetch<EiaResponse>(
     env, brentUrl, 'eia_brent', 'EIA', { ... }
   );
   ```

3. **Diesel WTI Crack** (dieselUrl):
   ```typescript
   const crack = await instrumentedFetch<EiaResponse>(
     env, dieselUrl, 'eia_diesel_wti_crack', 'EIA', { ... }
   );
   ```

### Updated Imports

```typescript
import type { Env } from "../env";
import { instrumentedFetch } from "../lib/api-instrumentation";
import { writeSeriesPoints } from "../db/client";
import { log } from "../lib/logging";
// ... other imports
```

### No Other Changes Needed

- Function signatures remain the same
- Error handling remains the same
- Return values remain the same
- API health metrics recording is automatic via `instrumentedFetch()`

---

## Step 0b: Verify Metrics Are Being Recorded

### 1. Run Local Test

```bash
# Start local worker with D1
corepack pnpm dev:worker

# In another terminal, trigger a collection run manually
curl -X POST http://localhost:8787/api/admin/run-poc \
  -H "Authorization: Bearer your-admin-token"
```

### 2. Check D1 for Recorded Metrics

```bash
# Connect to local D1
sqlite3 .wrangler/state/d1/DB.db

# Query recorded metrics
SELECT 
  feed_name, 
  provider, 
  status, 
  latency_ms, 
  attempted_at 
FROM api_health_metrics 
WHERE feed_name LIKE 'eia_%'
ORDER BY attempted_at DESC
LIMIT 10;

# Expected output:
# eia_wti|EIA|success|847|2026-04-24T14:30:00.000Z
# eia_brent|EIA|success|923|2026-04-24T14:30:00.000Z
# eia_diesel_wti_crack|EIA|success|891|2026-04-24T14:30:00.000Z
```

### 3. Check for Errors

If metrics aren't appearing, check:

```bash
# Check if api_health_metrics table exists
sqlite3 .wrangler/state/d1/DB.db \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'api_%';"

# Check if api_feed_registry is seeded
sqlite3 .wrangler/state/d1/DB.db \
  "SELECT COUNT(*) FROM api_feed_registry WHERE enabled = 1;"
```

---

## Step 0c: Test End-to-End via /api/admin/api-health

Once metrics are being recorded, verify the health endpoint works:

```bash
# Test the health endpoint
curl http://localhost:8787/api/admin/api-health \
  -H "Authorization: Bearer your-admin-token" | jq .

# Expected response structure:
{
  "generatedAt": "2026-04-24T14:35:00.000Z",
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
      "lastSuccessfulAt": "2026-04-24T14:30:00.000Z",
      "lastAttemptedAt": "2026-04-24T14:30:00.000Z",
      "attemptCount1h": 1,
      "successCount1h": 1,
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

---

## Step 0d: Wire Additional Collectors (Optional)

Once energy collector is working, you can wire additional collectors for more complete telemetry:

### Other collectors that could use instrumentedFetch:

- **ENTSOG Pipeline** (if implemented):
  ```typescript
  const data = await instrumentedFetch<PipelineResponse>(
    env, pipelineUrl, 'enia_pipeline', 'ENTSOG', { ... }
  );
  ```

- **GIE Storage** (if implemented):
  ```typescript
  const data = await instrumentedFetch<StorageResponse>(
    env, storageUrl, 'gie_storage', 'GIE', { ... }
  );
  ```

- **SEC EDGAR** (if implemented):
  ```typescript
  const data = await instrumentedFetch<EdgarResponse>(
    env, edgarUrl, 'sec_impairment', 'SEC', { ... }
  );
  ```

But start with energy collector first (it's the active one during Phase 1).

---

## Step 0e: Verify Metrics in Staging/Production

Before Day 22 deployment, verify telemetry works in staging:

```bash
# SSH into staging environment or use Cloudflare dashboard
# Run a manual collection via admin endpoint
POST https://staging-worker.example.com/api/admin/run-poc

# Wait 30 seconds
# Query D1 in staging
curl https://staging-worker.example.com/api/admin/api-health \
  -H "Authorization: Bearer staging-token"

# Should show metrics with status codes
```

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

Before moving to Step 1 (Grafana setup):

- [ ] Energy collector wired to use `instrumentedFetch()`
- [ ] Local test run completes without errors
- [ ] Metrics appear in local D1: `SELECT * FROM api_health_metrics LIMIT 1;`
- [ ] `/api/admin/api-health` endpoint returns data
- [ ] Health endpoint shows at least one feed with status "OK"
- [ ] Staging environment has metrics flowing
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
