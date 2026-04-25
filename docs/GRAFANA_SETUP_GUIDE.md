# Grafana Setup Guide: API Health Monitoring Dashboard

Complete walkthrough for setting up the Oil Shock API health monitoring dashboard in Grafana before Days 22-52 rollout execution.

**PREREQUISITE**: Complete `docs/TELEMETRY_SETUP_GUIDE.md` (Step 0) first to ensure API health metrics are being emitted and recorded to D1. Without telemetry flowing, this dashboard will have no data to display.

---

## Prerequisites

- Grafana instance running (v9.0+)
- D1 database configured as a Grafana data source
- Admin access to Grafana
- `docs/grafana-api-health-dashboard.json` (API health dashboard)
- `docs/grafana-api-health-alerts.md` (alert rule definitions)

---

## Step 1: Verify D1 Data Source

Before importing the dashboard, ensure D1 is configured as a Grafana data source.

### In Grafana:

1. Navigate to **Configuration** → **Data Sources**
2. Look for a data source named **"D1"** or similar
3. If it exists, click it and verify:
   - Type: SQLite / D1
   - Database: Points to your Oil Shock D1 database
   - Status: "Successfully connected"

4. If D1 data source doesn't exist:
   - Click **Add data source**
   - Search for "SQLite" or "Cloudflare D1"
   - Configure:
     - Name: `D1`
     - URL: Your D1 database connection string
     - Database: oil_shock (or your DB name)
   - Click **Save & Test**
   - Verify: "Successfully connected"

---

## Step 2: Import Dashboard

### Method A: Upload JSON File (Recommended)

1. In Grafana, go to **+ (Create)** → **Import**
2. Under "Upload JSON file", select `docs/grafana-api-health-dashboard.json`
3. Review the import preview
4. For **Data Source**, select **D1** from the dropdown
5. Click **Import**
6. Dashboard should now be available at `/d/` with auto-generated ID

### Method B: Copy & Paste JSON

1. Open `docs/grafana-api-health-dashboard.json` in a text editor
2. Copy the entire JSON content
3. In Grafana, go to **+ (Create)** → **Import**
4. Click **Paste JSON** tab
5. Paste the content
6. Select **D1** as data source
7. Click **Import**

### Verify Dashboard

After import:
1. Navigate to the new dashboard (Dashboard → Search → "API Health Status")
2. Verify all 6 panels load without errors:
   - **API Health Status Overview** (stat)
   - **Per-Feed Status** (table)
   - **Latency Trend** (time series)
   - **Error Rate Gauges** (gauge)
   - **Data Staleness Check** (table)
   - **Request Success Rate** (bar chart)

3. **If panels show "No data"**:
   - This is expected if no API calls have been made yet
   - The dashboard will populate data once collectors start using `instrumentedFetch()`

---

## Step 3: Configure Alert Rules

Alert rules must be created manually in Grafana. Each rule uses SQL queries against the D1 database.

### Alert Rule 1: Feed Timeout

1. In Grafana, go to **Alerting** → **Alert Rules**
2. Click **+ Create Alert Rule**
3. Configure:
   - **Rule name**: `API Feed Timeout - Critical`
   - **Data source**: Select **D1**
   - **Query**:
     ```sql
     SELECT feed_name, display_name, provider, timeout_threshold_ms
     FROM api_feed_registry afr
     WHERE afr.enabled = 1
       AND EXISTS (
         SELECT 1 FROM api_health_metrics ahm
         WHERE ahm.feed_name = afr.feed_name
           AND ahm.status = 'timeout'
           AND ahm.attempted_at >= datetime('now', '-15 minutes')
           AND ahm.latency_ms > afr.timeout_threshold_ms
       )
     ```
   - **Evaluate every**: 1m
   - **For**: 5m
   - **Condition**: `$A > 0` (fires if any rows returned)
   - **Annotations**:
     - **Summary**: "API Feed Timeout - {{ $labels.display_name }}"
     - **Description**: "Feed {{ $labels.feed_name }} ({{ $labels.provider }}) exceeded timeout threshold of {{ $labels.timeout_threshold_ms }}ms"
   - **Notification channel**: `#eng-alerts` (Slack) + PagerDuty
4. Click **Save and exit**

### Alert Rule 2: Feed Error Rate

1. Click **+ Create Alert Rule**
2. Configure:
   - **Rule name**: `High Error Rate - Warning`
   - **Data source**: D1
   - **Query**:
     ```sql
     SELECT
       afr.feed_name,
       afr.display_name,
       afr.provider,
       afr.error_rate_threshold_pct,
       ROUND(100.0 * SUM(CASE WHEN ahm.status != 'success' THEN 1 ELSE 0 END) / NULLIF(COUNT(ahm.id), 0), 1) as error_rate_pct
     FROM api_feed_registry afr
     LEFT JOIN api_health_metrics ahm
       ON afr.feed_name = ahm.feed_name
       AND ahm.attempted_at >= datetime('now', '-1 hour')
     WHERE afr.enabled = 1
     GROUP BY afr.feed_name, afr.display_name, afr.provider, afr.error_rate_threshold_pct
     HAVING error_rate_pct > afr.error_rate_threshold_pct
     ```
   - **Evaluate every**: 2m
   - **For**: 10m
   - **Annotations**:
     - **Summary**: "High Error Rate - {{ $labels.display_name }}"
     - **Description**: "Feed {{ $labels.feed_name }} has {{ $value }}% error rate (threshold: {{ $labels.error_rate_threshold_pct }}%)"
   - **Notification channel**: `#eng-alerts` (Slack)
3. Click **Save and exit**

### Alert Rule 3: Data Staleness

1. Click **+ Create Alert Rule**
2. Configure:
   - **Rule name**: `Data Staleness - Warning`
   - **Data source**: D1
   - **Query**:
     ```sql
     SELECT
       afr.feed_name,
       afr.display_name,
       afr.provider,
       afr.freshness_window_hours,
       CAST(ROUND((julianday('now') - julianday(MAX(CASE WHEN ahm.status = 'success' THEN ahm.attempted_at END))) * 24, 1) AS REAL) as hours_since_success
     FROM api_feed_registry afr
     LEFT JOIN api_health_metrics ahm ON afr.feed_name = ahm.feed_name
     WHERE afr.enabled = 1
     GROUP BY afr.feed_name, afr.display_name, afr.provider, afr.freshness_window_hours
     HAVING
       MAX(CASE WHEN ahm.status = 'success' THEN ahm.attempted_at END) IS NULL
       OR (julianday('now') - julianday(MAX(CASE WHEN ahm.status = 'success' THEN ahm.attempted_at END))) * 24 > afr.freshness_window_hours
     ```
   - **Evaluate every**: 5m
   - **For**: 30m
   - **Annotations**:
     - **Summary**: "Data Staleness - {{ $labels.display_name }}"
     - **Description**: "Feed {{ $labels.feed_name }} has no successful data in {{ $value }} hours (freshness window: {{ $labels.freshness_window_hours }}h)"
   - **Notification channel**: `#eng-alerts` (Slack)
3. Click **Save and exit**

### Alert Rule 4: All Critical Feeds Down

1. Click **+ Create Alert Rule**
2. Configure:
   - **Rule name**: `All Critical Feeds Down - Critical`
   - **Data source**: D1
   - **Query**:
     ```sql
     SELECT COUNT(*) as down_feeds
     FROM api_feed_registry afr
     WHERE afr.enabled = 1
       AND afr.feed_name IN ('eia_wti', 'eia_inventory', 'eia_refinery')
       AND EXISTS (
         SELECT 1 FROM api_health_metrics ahm
         WHERE ahm.feed_name = afr.feed_name
           AND ahm.status IN ('timeout', 'failure')
           AND ahm.attempted_at >= datetime('now', '-5 minutes')
       )
     ```
   - **Evaluate every**: 1m
   - **For**: 2m
   - **Condition**: `$A >= 3` (fires if all 3 critical feeds down)
   - **Annotations**:
     - **Summary**: "All Critical Feeds Down - Emergency"
     - **Description**: "EIA WTI, Inventory, and Refinery feeds are all unavailable. Check upstream status."
   - **Notification channel**: PagerDuty + `#eng-alerts` (Slack)
4. Click **Save and exit**

### Alert Rule 5: Latency Degradation

1. Click **+ Create Alert Rule**
2. Configure:
   - **Rule name**: `Latency Degradation - Warning`
   - **Data source**: D1
   - **Query**:
     ```sql
     SELECT
       afr.feed_name,
       afr.display_name,
       ROUND(AVG(ahm.latency_ms), 0) as avg_latency_ms,
       ROUND(MAX(ahm.latency_ms), 0) as p95_latency_ms
     FROM api_feed_registry afr
     LEFT JOIN api_health_metrics ahm
       ON afr.feed_name = ahm.feed_name
       AND ahm.status = 'success'
       AND ahm.attempted_at >= datetime('now', '-1 hour')
     WHERE afr.enabled = 1
     GROUP BY afr.feed_name, afr.display_name
     HAVING avg_latency_ms > 5000 OR p95_latency_ms > 20000
     ```
   - **Evaluate every**: 5m
   - **For**: 15m
   - **Annotations**:
     - **Summary**: "Latency Degradation - {{ $labels.display_name }}"
     - **Description**: "Feed {{ $labels.feed_name }} P95 latency is {{ $value }}ms (threshold: 20000ms)"
   - **Notification channel**: `#eng-alerts` (Slack)
3. Click **Save and exit**

---

## Step 4: Test Queries Against Live Data

Before Day 22, verify all dashboard queries return sensible results.

### In Grafana Query Editor:

1. Go to **Explore**
2. Select **D1** data source
3. Run each query from the dashboard:

```sql
-- Test 1: Check api_feed_registry is seeded
SELECT COUNT(*) as feed_count FROM api_feed_registry WHERE enabled = 1;
-- Expected: 8 (EIA, ENTSOG, GIE, SEC)

-- Test 2: Check api_health_metrics table exists
SELECT COUNT(*) as metric_count FROM api_health_metrics LIMIT 1;
-- Expected: 0 initially (will populate during collection)

-- Test 3: Test P95 latency calculation
SELECT feed_name, COUNT(*) as success_count
FROM api_health_metrics
WHERE status = 'success'
  AND attempted_at >= datetime('now', '-1 hour')
GROUP BY feed_name;
-- Expected: 0 initially (will populate during collection)
```

**Note**: Metrics table will be empty until collectors start using `instrumentedFetch()` to record API calls.

---

## Step 5: Verify Alert Routing

### Slack Integration

1. In Grafana, go to **Configuration** → **Notification channels**
2. Verify **#eng-alerts** channel exists
3. If not, create it:
   - **Name**: `eng-alerts`
   - **Type**: Slack
   - **Webhook URL**: Your Slack webhook for #eng-alerts
   - **Channel**: `#eng-alerts`
   - Click **Test**
   - Verify Slack received a test message

### PagerDuty Integration

1. In Grafana, go to **Configuration** → **Notification channels**
2. Verify **PagerDuty** exists
3. If not, create it:
   - **Name**: `PagerDuty`
   - **Type**: PagerDuty
   - **Integration Key**: Your PagerDuty API key
   - Click **Test**
   - Verify incident created in PagerDuty

---

## Step 6: Create Notification Policy

Configure how alerts are routed:

1. In Grafana, go to **Alerting** → **Notification policies**
2. Edit default policy:
   - **Receiver**: `eng-alerts`
   - **Group by**: `feed_name`, `provider`
   - **Group wait**: 10s
   - **Group interval**: 5m
   - **Repeat interval**: 4h

3. Add routing rules:
   - **Rule 1** (Critical alerts):
     - **Match**: `severity = "critical"`
     - **Receiver**: `PagerDuty`
     - **Continue**: Yes (also send to eng-alerts)
   
   - **Rule 2** (Warning alerts):
     - **Match**: `severity = "warning"`
     - **Receiver**: `eng-alerts`

---

## Step 7: Dry-Run Alert Testing

Before Day 22, test that alerts would fire correctly:

1. Manually insert test data into `api_health_metrics`:
   ```sql
   INSERT INTO api_health_metrics (feed_name, provider, status, latency_ms, error_message, attempted_at)
   VALUES ('eia_wti', 'EIA', 'timeout', 35000, 'Request timeout after 30000ms', datetime('now', '-5 minutes'));
   ```

2. Wait 5-10 minutes for alert evaluation

3. Verify:
   - Slack message in #eng-alerts
   - PagerDuty incident created (if critical alert)
   - Dashboard shows the test feed in timeout status

4. Clean up test data:
   ```sql
   DELETE FROM api_health_metrics WHERE feed_name = 'eia_wti' AND error_message = 'Request timeout after 30000ms';
   ```

---

## Troubleshooting

### "No data" in dashboard panels

**Cause**: No API calls recorded yet (collectors not using `instrumentedFetch()`)  
**Fix**: This is normal before Day 22. Data will appear once collectors start recording metrics.

### Alert rules not evaluating

**Cause**: D1 data source connection issue  
**Fix**: 
1. Go to **Data Sources** → **D1** → **Test**
2. Verify "Successfully connected"
3. Run a simple query: `SELECT 1;`
4. If fails, check database credentials

### Alerts firing incorrectly

**Cause**: Query logic mismatch  
**Fix**:
1. Go to **Alerting** → **Alert Rules** → Edit rule
2. Test the query manually in **Explore**
3. Verify results match expected behavior
4. Adjust query `HAVING` clause if needed

---

## Next Steps

Once dashboard and alerts are configured:

1. ✅ Update `docs/current-priorities.md` to reflect "Days 22-52: Rollout Execution"
2. ✅ Create incident response runbook
3. ✅ Brief team on dashboard, alerts, and rollback procedures
4. ✅ Rehearse rollback procedure (set ENERGY_ROLLOUT_PERCENT=0)
5. ✅ **Day 22: Begin Phase 1 canary deployment**

---

## References

- `docs/rollout-monitoring-strategy.md` - Full rollout monitoring strategy with daily checklists
- `docs/grafana-api-health-dashboard.json` - Dashboard definition
- `docs/grafana-api-health-alerts.md` - Alert rule definitions with full SQL
- `db/migrations/0015_api_health_tracking.sql` - Database schema for api_health_metrics and api_feed_registry
