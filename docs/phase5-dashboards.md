# Phase 5: Grafana Cloud Dashboards Guide

Once your OTLP traces start flowing to Grafana Cloud (2-3 minutes after deployment), follow this guide to build 4 operational dashboards.

## Available Metrics from OpenTelemetry

Cloudflare Workers automatically exports:
- **http.request.duration** - Request latency (ms)
- **http.requests.total** - Request count by method/path/status
- **db.client.duration** - D1 query latency (ms)
- **faas.invoke.duration** - Function execution time
- Request attributes: `http.method`, `http.status_code`, `http.url`, `server.address`
- Span events with log data (our structured JSON logs)

## Dashboard 1: Overview Dashboard

**Purpose:** Real-time health overview showing requests, errors, and latency.

### Panels to Create:

1. **Request Rate (top-left)**
   - Metric: `rate(http_requests_total[5m])`
   - Type: Stat
   - Unit: `req/s`
   - Thresholds: Green ≤100, Yellow 100-500, Red >500

2. **Error Rate (top-right)**
   - Metric: `sum(rate(http_requests_total{http_status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100`
   - Type: Stat
   - Unit: `%`
   - Thresholds: Green <1%, Yellow 1-5%, Red >5%

3. **Response Latency (middle-left)**
   - Metric: `histogram_quantile(0.95, rate(http_request_duration_milliseconds_bucket[5m]))`
   - Type: Gauge
   - Unit: `ms`
   - Label: "p95 Latency"
   - Thresholds: Green <100ms, Yellow 100-500ms, Red >500ms

4. **Status Code Distribution (middle-right)**
   - Metric: `sum by (http_status_code) (rate(http_requests_total[5m]))`
   - Type: Pie Chart
   - Legend: Show status codes (200, 404, 500, etc)

5. **Request Timeline (bottom, full width)**
   - Metric: `rate(http_requests_total[1m])`
   - Type: Time Series
   - Stack: On
   - Legend: Show by status code

## Dashboard 2: Database Performance Dashboard

**Purpose:** Monitor D1 query performance and efficiency.

### Panels to Create:

1. **Query Count (top-left)**
   - Metric: `sum(rate(db_client_operations_total[5m]))`
   - Type: Stat
   - Unit: `queries/s`

2. **Query Latency p95 (top-middle)**
   - Metric: `histogram_quantile(0.95, rate(db_client_duration_milliseconds_bucket[5m]))`
   - Type: Gauge
   - Unit: `ms`

3. **Query Latency p99 (top-right)**
   - Metric: `histogram_quantile(0.99, rate(db_client_duration_milliseconds_bucket[5m]))`
   - Type: Gauge
   - Unit: `ms`

4. **Query Duration Over Time (middle, full width)**
   - Metrics:
     - `histogram_quantile(0.50, rate(db_client_duration_milliseconds_bucket[5m]))` → p50
     - `histogram_quantile(0.95, rate(db_client_duration_milliseconds_bucket[5m]))` → p95
     - `histogram_quantile(0.99, rate(db_client_duration_milliseconds_bucket[5m]))` → p99
   - Type: Time Series

5. **Slow Queries (bottom, full width)**
   - Query: Filter traces where `db_client_duration_milliseconds > 100`
   - Type: Table
   - Columns: Query, Duration, Timestamp, Request ID
   - Sort by: Duration (descending)

## Dashboard 3: Collector Health Dashboard

**Purpose:** Monitor collection job success rates and performance.

### Panels to Create:

1. **Last Collection Run Status (top-left)**
   - Log query: `{job="oil-shock-collector"} | json | status`
   - Type: Stat
   - Show: Last value
   - Color by: "success" = green, "failed" = red

2. **Collection Success Rate (top-right)**
   - Log query: `{job="oil-shock-collector"} | json | status` grouped by status
   - Type: Pie Chart
   - Legend: Show status values

3. **Collection Duration (middle-left)**
   - Log query: Filter spans with `span.name="collection-pipeline"`
   - Metric: `span.duration_ms`
   - Type: Gauge
   - Unit: `seconds`

4. **Data Points Collected Over Time (middle-right)**
   - Log query: `{job="oil-shock-collector"} | json | points_count`
   - Type: Time Series
   - Legend: Group by collection source (energy, etc)

5. **Collector Error Log (bottom, full width)**
   - Log query: `{level="error"} AND {job="oil-shock-collector"}`
   - Type: Table
   - Columns: Timestamp, Message, Error Code, Request ID

## Dashboard 4: Operational Dashboard

**Purpose:** Operational observability for operators.

### Panels to Create:

1. **Health Check Status (top-left)**
   - Query: HTTP requests to `/health` endpoint
   - Filter: Latest status code per endpoint
   - Type: Table
   - Columns: Component, Status, Latency, Last Updated

2. **Worker Cold Start Rate (top-middle)**
   - Metric: Count of requests with `faas.trigger="cold_start"`
   - Type: Stat
   - Unit: `%` (cold starts / total requests)

3. **Feature Flags Status (top-right)**
   - Log query: `{level="info"} | json | feature_flags`
   - Type: Table
   - Columns: Feature, Enabled, Last Changed

4. **Request Trace (middle-left)**
   - Latest request trace with request ID
   - Type: Trace view
   - Show: Span tree with latencies

5. **Error Rate by Endpoint (middle-right)**
   - Metric: `sum(rate(http_requests_total{http_status_code=~"5.."}[5m])) by (http.route)`
   - Type: Bar Chart
   - Sort: By error count (descending)
   - Top: 10

6. **Recent Errors Log (bottom, full width)**
   - Log query: `{level="error"}`
   - Type: Table
   - Columns: Timestamp, Endpoint, Error, Request ID
   - Action: Click row to see full trace

## Creating Dashboards in Grafana Cloud

### Option A: Manual Dashboard Creation (15-20 minutes)

1. Go to **Dashboards → Create → New dashboard**
2. For each dashboard:
   - Click **Add panel**
   - Select **Prometheus** data source for metrics
   - Or select **Loki** data source for logs
   - Enter metric/log query from panels above
   - Customize visualization (type, thresholds, legends)
   - Save panel
3. Arrange panels in desired layout
4. Set refresh rate to 30 seconds
5. Save dashboard

### Option B: Import JSON (5 minutes)

Once dashboards are created manually, export them:
1. Dashboard settings (gear icon) → **JSON model**
2. Copy JSON
3. Share with team or version control

To import later:
1. **Dashboards → Import**
2. Paste JSON
3. Select data source (Prometheus/Loki)
4. Import

## Data Source Configuration

Make sure these data sources are available in Grafana Cloud:

1. **Prometheus** - For metrics (should be auto-configured)
2. **Loki** - For logs (should be auto-configured from OTLP endpoint)
3. **Traces** - For trace view (should be auto-configured)

To verify: **Configuration → Data Sources** should show all three.

## Testing Dashboards

1. Deploy Worker to preview: `wrangler deploy --env preview`
2. Generate test traffic:
   ```bash
   for i in {1..100}; do
     curl https://your-preview.workers.dev/health
     sleep 0.1
   done
   ```
3. Wait 2-3 minutes for traces to appear
4. Check dashboard panels populate with data

## Troubleshooting

**No data in panels?**
- Verify OTLP traces are flowing: **Explore → Traces**
- Check data source is selected correctly
- Ensure metric/log query syntax is correct
- Wait 5+ minutes for metrics to aggregate

**Metrics not available?**
- Cloudflare may take 5-10 minutes to export first metrics
- Check OTLP endpoint and auth headers are correct
- Verify no errors in Worker logs: `wrangler tail --env preview`

**Timestamps are wrong?**
- Ensure Worker system time is correct
- Grafana Cloud automatically normalizes timestamps

## Next Steps (Phase 6)

Once dashboards are created, create:
1. **Runbook: High Error Rate** - Debug steps
2. **Runbook: Slow Queries** - Query optimization guide
3. **Runbook: Collector Failures** - Data collection troubleshooting
4. **Runbook: Health Check Failing** - Dependency diagnosis
