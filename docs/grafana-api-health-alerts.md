# Grafana Alert Rules for API Health Monitoring

This document defines alert rules for monitoring API feed health in Oil Shock. These rules are designed for Grafana and use SQL queries against the D1 database.

## Alert Rule Definitions

### 1. Feed Timeout Alert

**Severity**: Critical

**Description**: An API feed has exceeded its timeout threshold and is not responding.

**Query**:
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

**Condition**: 
- Fires if any enabled feed has a timeout status in the last 15 minutes
- AND latency exceeds the feed's configured threshold

**Duration**: 5 minutes

**Annotations**:
```
title: "API Feed Timeout: {{ $labels.display_name }}"
description: "Feed {{ $labels.feed_name }} ({{ $labels.provider }}) exceeded timeout threshold of {{ $labels.timeout_threshold_ms }}ms"
```

**Dashboard URL**: `/api/admin/api-health`

---

### 2. Feed Error Rate Alert

**Severity**: Warning

**Description**: An API feed is experiencing a high error rate.

**Query**:
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

**Condition**:
- Fires if error rate (last hour) exceeds the feed's threshold
- Default threshold is 10% for most feeds, 15% for SEC EDGAR

**Duration**: 10 minutes

**Annotations**:
```
title: "High Error Rate: {{ $labels.display_name }}"
description: "Feed {{ $labels.feed_name }} has {{ $value }}% error rate (threshold: {{ $labels.error_rate_threshold_pct }}%)"
```

---

### 3. Data Staleness Alert

**Severity**: Warning → Critical (based on age)

**Description**: A feed has not provided new data within its freshness window.

**Query**:
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

**Condition**:
- Fires if no successful data point exists OR
- Last successful data is older than the feed's freshness window

**Duration**:
- Warning: 30 minutes stale
- Critical: > freshness_window_hours

**Annotations**:
```
title: "Stale Data: {{ $labels.display_name }}"
description: "Feed {{ $labels.feed_name }} has not provided data for {{ $value }} hours (threshold: {{ $labels.freshness_window_hours }} hours)"
```

---

### 4. All Critical Feeds Down Alert

**Severity**: Critical

**Description**: Multiple feeds required for accurate scoring are simultaneously unavailable.

**Query**:
```sql
SELECT
  COUNT(DISTINCT afr.feed_name) as down_feed_count,
  GROUP_CONCAT(afr.display_name, ', ') as down_feeds
FROM api_feed_registry afr
LEFT JOIN api_health_metrics ahm
  ON afr.feed_name = ahm.feed_name
  AND ahm.attempted_at >= datetime('now', '-1 hour')
WHERE afr.enabled = 1
  AND afr.feed_name IN ('eia_wti', 'eia_inventory', 'eia_refinery')
GROUP BY 1
HAVING COUNT(DISTINCT ahm.id) = 0
  OR SUM(CASE WHEN ahm.status = 'success' THEN 1 ELSE 0 END) = 0
```

**Condition**:
- Fires if any of the three critical price/inventory feeds have no successful requests in the last hour
- Critical feeds: EIA WTI, EIA Inventory, EIA Refinery

**Duration**: 2 minutes

**Annotations**:
```
title: "CRITICAL: Multiple feeds down"
description: "Critical feeds offline: {{ $value.down_feeds }}"
```

**Additional Action**: 
- Page on-call engineer
- Check EIA API status page
- Consider triggering manual data collection from backup sources

---

### 5. Latency Degradation Alert

**Severity**: Info → Warning

**Description**: An API feed is responding slower than normal.

**Query**:
```sql
SELECT
  afr.feed_name,
  afr.display_name,
  afr.provider,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ahm.latency_ms) as p95_latency_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ahm.latency_ms) as p50_latency_ms
FROM api_feed_registry afr
JOIN api_health_metrics ahm
  ON afr.feed_name = ahm.feed_name
  AND ahm.status = 'success'
  AND ahm.attempted_at >= datetime('now', '-1 hour')
WHERE afr.enabled = 1
GROUP BY afr.feed_name, afr.display_name, afr.provider
HAVING p95_latency_ms > 20000 OR p50_latency_ms > 15000
```

**Condition**:
- Warning: P95 latency > 20 seconds OR P50 > 15 seconds
- Information: P95 > 10 seconds

**Duration**: 15 minutes

**Annotations**:
```
title: "Latency Degradation: {{ $labels.display_name }}"
description: "Feed {{ $labels.feed_name }} P95 latency is {{ $value }}ms (higher than normal)"
```

---

## Alert Routing and Escalation

### By Severity

| Severity | Routing | Escalation | Auto-Remediation |
|----------|---------|-----------|------------------|
| Critical | PagerDuty, Slack #oil-shock-critical | Page on-call | Trigger fallback data source |
| Warning | Slack #oil-shock-alerts | Slack mention if > 30m | Manual review queue |
| Info | Grafana dashboard | Logging only | None |

### Example Notification Template

```
Oil Shock API Health Alert

Feed: {{ .GroupLabels.display_name }}
Provider: {{ .GroupLabels.provider }}
Status: {{ .Alerts.0.Status }}
Severity: {{ .CommonLabels.severity }}

Last Attempt: {{ $timestamp }}
Error Rate: {{ $error_rate }}%
Time Since Success: {{ $hours_since_success }} hours

Dashboard: https://grafana.example.com/d/oil-shock-health
API Health Endpoint: /api/admin/api-health
```

---

## Running Alert Rules Locally

For development and testing, export alert rules as Grafana JSON:

```bash
# Export current dashboard alerts
curl -H "Authorization: Bearer $GRAFANA_TOKEN" \
  https://grafana.example.com/api/v1/rules \
  | jq '.data[] | select(.title | contains("API Health"))' > alerts.json
```

---

## Modifying Alert Thresholds

Thresholds are stored in the `api_feed_registry` table and can be updated without redeployment:

```sql
-- Update error rate threshold for a specific feed
UPDATE api_feed_registry
SET error_rate_threshold_pct = 15.0
WHERE feed_name = 'sec_impairment';

-- Update timeout threshold
UPDATE api_feed_registry
SET timeout_threshold_ms = 45000
WHERE feed_name = 'entsog_pipeline';

-- Update freshness window
UPDATE api_feed_registry
SET freshness_window_hours = 48
WHERE feed_name = 'eia_inventory';
```

---

## Health Dashboard Queries

### Quick System Status

```sql
SELECT
  CASE
    WHEN COUNT(DISTINCT CASE WHEN status = 'OK' THEN 1 END) = COUNT(DISTINCT feed_name) THEN 'All Green'
    WHEN COUNT(DISTINCT CASE WHEN status IN ('ERROR', 'TIMEOUT') THEN 1 END) > 0 THEN 'Issues Detected'
    ELSE 'Partially Degraded'
  END as system_status
FROM (
  SELECT DISTINCT afr.feed_name, 
    CASE
      WHEN MAX(ahm.status) = 'success' AND 
           (julianday('now') - julianday(MAX(ahm.attempted_at))) * 24 <= afr.freshness_window_hours
      THEN 'OK'
      ELSE 'ERROR'
    END as status
  FROM api_feed_registry afr
  LEFT JOIN api_health_metrics ahm ON afr.feed_name = ahm.feed_name
  WHERE afr.enabled = 1
  GROUP BY afr.feed_name
) health_summary
```

### Top Failing Feeds (Last 24h)

```sql
SELECT
  afr.display_name,
  COUNT(*) as total_requests,
  SUM(CASE WHEN ahm.status != 'success' THEN 1 ELSE 0 END) as failures,
  ROUND(100.0 * SUM(CASE WHEN ahm.status != 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) as error_rate_pct
FROM api_feed_registry afr
JOIN api_health_metrics ahm ON afr.feed_name = ahm.feed_name
WHERE ahm.attempted_at >= datetime('now', '-24 hours')
GROUP BY afr.feed_name, afr.display_name
ORDER BY error_rate_pct DESC
LIMIT 10
```

---

## Integration with Oil Shock Scoring

When an API health alert fires, the scoring system should:

1. **Flag the data source as stale** in `config_thresholds`
2. **Reduce coverage confidence** for affected subscores
3. **Conservative downgrade**: If critical dimensions are missing/stale, downgrade state to `aligned`
4. **Log the event** for manual review in the admin UI

See `docs/architecture.md#freshness-and-determinism` for details on coverage degradation behavior.
