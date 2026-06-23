# Observability Runbooks

Quick reference guides for troubleshooting operational issues.

## Runbook 1: High Error Rate Alert

**Symptom:** Error rate > 5% on overview dashboard

### Investigation Steps:

1. **Identify error type:**
   ```
   Go to: Operational Dashboard → Recent Errors Log
   Filter: level="error"
   Group by: error code, http.status_code
   ```

2. **Find affected endpoints:**
   ```
   Go to: Operational Dashboard → Error Rate by Endpoint
   Identify top endpoints with errors
   ```

3. **Check request traces:**
   ```
   For each failed request:
   - Click req_id in error log
   - View full trace with timing
   - Look for: slow queries, timeouts, dependency failures
   ```

4. **Root cause diagnosis:**
   - **500 Internal Server Error** → Check Worker logs: `wrangler tail --env production`
   - **D1 errors** → See "Slow/Failing Database Queries" runbook
   - **Timeout errors** → Check Database Performance dashboard for query latency
   - **4xx errors** → Usually client issues, check request format

5. **Escalation:**
   - If error rate >10%: page on-call
   - If errors persist >15 min: consider rollback
   - Collect logs: `wrangler logs pull --env production > error-logs.txt`

---

## Runbook 2: Slow or Failing Database Queries

**Symptom:** Database latency spike or `db.error` in logs

### Investigation Steps:

1. **Check database health:**
   ```
   Go to: Health Check Status panel
   Verify: database component shows "healthy"
   If unhealthy: D1 may be unavailable
   ```

2. **Identify slow queries:**
   ```
   Go to: Database Performance Dashboard → Slow Queries table
   Sort by: Duration (descending)
   Check: Query type, latency, which endpoint triggered it
   ```

3. **Correlate with requests:**
   ```
   Find request ID from slow query
   Go to: Operational Dashboard → Recent Errors Log
   Search by req_id to see full request context
   ```

4. **Check query patterns:**
   - **Unindexed queries?** → Add index to table (consult schema)
   - **N+1 query pattern?** → Batch queries or add caching
   - **Full table scan?** → Add WHERE clause or index
   - **Large result set?** → Implement pagination

5. **Recovery:**
   - Restart D1: `wrangler d1 execute energy_dislocation --env production -- VACUUM`
   - Check database size: `wrangler d1 info energy_dislocation`
   - If >5GB: Consider archiving old data

---

## Runbook 3: Collector Job Failures

**Symptom:** Collector Health dashboard shows failed runs or missing data

### Investigation Steps:

1. **Check last run status:**
   ```
   Go to: Collector Health Dashboard → Last Collection Run Status
   If "failed": proceed to step 2
   If "success": data collection is working
   ```

2. **Find failure reason:**
   ```
   Go to: Collector Health Dashboard → Collector Error Log
   Look for: error messages, stack traces, specific component failures
   ```

3. **By error type:**

   **"Data source unreachable"**
   - Check network connectivity to EIA/GIE APIs
   - Verify API credentials: `echo $EIA_API_KEY` (in Worker env)
   - Check API rate limits: Compare request count to limit
   - Solution: Wait for rate limit reset or reduce collection frequency

   **"Missing data points"**
   - Check data source is still publishing
   - Verify collection window hasn't changed
   - See: Worker logs for parse errors
   - Solution: Update normalizer if data format changed

   **"Database insert failed"**
   - Check D1 is healthy: See "Slow/Failing Queries" runbook
   - Check table schema matches: Run migrations
   - Check row count: `SELECT COUNT(*) FROM series_points`
   - Solution: If DB is full (>10GB), archive old data

4. **Manual retry:**
   ```bash
   # Trigger collection manually
   curl -X POST https://oil-shock-worker.workers.dev/api/admin/run-poc \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

5. **Escalation:**
   - If >2 consecutive failures: Page on-call
   - If missing >24 hours of data: Consider partial restore from backup

---

## Runbook 4: Health Check Endpoint Returning 503

**Symptom:** `/health` endpoint returns 503 or "dependencies.database.status = unhealthy"

### Investigation Steps:

1. **Identify failed dependency:**
   ```
   Go to: Overview Dashboard
   Check: Health Check Status panel
   Failed component could be:
   - database (D1 unreachable)
   - config (config_thresholds table missing)
   ```

2. **If database is unhealthy:**
   - Verify D1 is running: `wrangler d1 list`
   - Check D1 quota: `wrangler d1 info energy_dislocation`
   - Try connecting directly: `wrangler d1 shell energy_dislocation`
   - Query: `SELECT 1;` should return success
   - If fails: D1 service issue, contact Cloudflare support

3. **If config_thresholds is missing:**
   - Verify table exists: `SELECT COUNT(*) FROM config_thresholds`
   - If 0 rows: Run migrations: `wrangler d1 execute energy_dislocation --env production < db/migrations/0004_config_thresholds.sql`
   - If table missing: Database is corrupted, restore from backup

4. **Check Worker logs:**
   ```bash
   wrangler tail --env production | grep "health"
   ```

5. **Recovery:**
   - **Temporary:** Disable health check (not recommended)
   - **Short term:** Restart Worker: `wrangler publish --env production`
   - **Long term:** Fix underlying D1 issue or restore from backup

---

## Runbook 5: Slow Worker Cold Starts

**Symptom:** Request latency spikes, cold start rate > 5%

### Investigation Steps:

1. **Identify cold starts:**
   ```
   Go to: Operational Dashboard → Worker Cold Start Rate
   If >5%: Cold starts are causing latency
   ```

2. **Check recent deployments:**
   - Cold starts are expected after deployment
   - They should recover within 10 minutes
   - If persistent: May indicate memory leak or initialization issue

3. **Optimize cold start time:**
   - Reduce Worker bundle size: Check `npm run build` output
   - Remove unused imports in `worker/src/index.ts`
   - Lazy-load heavy dependencies if possible
   - Profile with: `wrangler publish --env preview` and watch timing

4. **Monitor baseline:**
   - Baseline cold start: ~200-500ms
   - Baseline warm request: ~50-100ms
   - If baseline increasing: Investigate code changes

---

## Runbook 6: Request Correlation Debugging

**Using Request IDs to trace issues across logs and traces**

### Scenario: User reports "my request failed at X time"

1. **Find the request ID:**
   - Check error from user timestamp
   - Search logs: `{timestamp="2026-04-24T10:25:00Z"}`
   - Look for matching `req_id` in error message
   - Example: `req_id="mocrlzyb-eo8h44ji"`

2. **Trace through logs:**
   ```
   Go to: Explore → Logs
   Search: {req_id="mocrlzyb-eo8h44ji"}
   This shows all logs for that request
   ```

3. **View full trace:**
   ```
   Go to: Explore → Traces
   Search by: req_id="mocrlzyb-eo8h44ji"
   View: Timeline of all spans (API calls, DB queries)
   Check: Latency at each step
   ```

4. **Identify bottleneck:**
   - Find span with longest duration
   - That's where time was spent
   - Example: "db_query_config_thresholds" took 50ms

5. **Next steps:**
   - If DB query is slow: See "Slow Queries" runbook
   - If external API is slow: May be rate limited
   - If Worker itself is slow: Check code changes

---

## Alert Thresholds (Recommended)

Create these alerts in Grafana Cloud:

| Alert | Condition | Duration | Action |
|-------|-----------|----------|--------|
| **High Error Rate** | error_rate > 5% | 5 min | Page on-call |
| **Slow Queries** | db_latency_p95 > 500ms | 10 min | Investigate DB |
| **Collector Failed** | collector_status = "failed" | 1 occurrence | Investigate data |
| **Health Check Failed** | /health returns 503 | 2 min | Check D1 connectivity |
| **High Latency** | request_latency_p95 > 200ms | 10 min | Check load/cold starts |

---

## Emergency Contacts

- **D1 Issues:** Cloudflare Support Dashboard
- **OTLP Export Issues:** Check Worker logs for auth errors
- **On-Call Escalation:** See internal runbook (not in repo)
- **Metrics Data Loss:** OTLP data is not persisted locally; rely on Grafana Cloud retention

---

## Appendix: Common Commands

```bash
# View Worker logs in real-time
wrangler tail --env production

# Check D1 database
wrangler d1 shell energy_dislocation
> SELECT COUNT(*) FROM series_points;
> SELECT COUNT(*) FROM config_thresholds;

# Force collection job
curl -X POST https://oil-shock-worker.workers.dev/api/admin/run-poc \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check health endpoint
curl https://oil-shock-worker.workers.dev/health | jq

# View trace by request ID
# In Grafana Cloud: Explore → Traces → Search: req_id=YOUR_ID_HERE

# Pull historical logs
wrangler logs pull --env production > logs.txt
```
