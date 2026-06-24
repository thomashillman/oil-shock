-- API health metrics tracking for feed monitoring
-- Extensible design: feed_name + provider form a logical feed identifier
-- Indexes optimized for common queries: recent metrics, per-feed aggregations

CREATE TABLE IF NOT EXISTS api_health_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'timeout')),
  latency_ms INTEGER,
  error_message TEXT,
  attempted_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for per-feed recent health checks
CREATE INDEX IF NOT EXISTS idx_api_health_metrics_feed_attempted
  ON api_health_metrics(feed_name, provider, attempted_at DESC);

-- Index for status aggregations
CREATE INDEX IF NOT EXISTS idx_api_health_metrics_status_time
  ON api_health_metrics(status, attempted_at DESC);

-- Index for latency percentile queries
CREATE INDEX IF NOT EXISTS idx_api_health_metrics_feed_latency
  ON api_health_metrics(feed_name, provider, latency_ms)
  WHERE status = 'success';

-- Table to track feed registry: human-friendly names and metadata
CREATE TABLE IF NOT EXISTS api_feed_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  freshness_window_hours INTEGER DEFAULT 24,
  timeout_threshold_ms INTEGER DEFAULT 30000,
  error_rate_threshold_pct REAL DEFAULT 10.0,
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast registry lookups
CREATE INDEX IF NOT EXISTS idx_api_feed_registry_enabled
  ON api_feed_registry(enabled, feed_name);

-- Seed the feed registry with current feeds
INSERT INTO api_feed_registry (
  feed_name,
  provider,
  display_name,
  description,
  freshness_window_hours,
  timeout_threshold_ms,
  error_rate_threshold_pct
) VALUES
  ('eia_wti', 'EIA', 'EIA WTI Spot', 'US crude WTI spot price from Energy Information Administration', 24, 30000, 10.0),
  ('eia_brent', 'EIA', 'EIA Brent Spot', 'Brent crude spot price from Energy Information Administration', 24, 30000, 10.0),
  ('eia_inventory', 'EIA', 'EIA US Crude Inventory', 'US crude oil inventory levels from EIA', 48, 30000, 10.0),
  ('eia_refinery', 'EIA', 'EIA Refinery Utilization', 'US refinery utilization rates from EIA', 48, 30000, 10.0),
  ('eia_futures_curve', 'EIA', 'EIA Futures Curve', 'WTI crude oil futures curve slope from EIA', 24, 30000, 10.0),
  ('enia_pipeline', 'ENTSOG', 'ENTSOG EU Pipeline Flow', 'EU natural gas pipeline operational data from ENTSOG', 48, 30000, 10.0),
  ('gie_storage', 'GIE', 'GIE AGSI+ EU Gas Storage', 'European gas storage inventory from GIE AGSI+', 48, 30000, 10.0),
  ('sec_impairment', 'SEC', 'SEC EDGAR Impairment Filings', 'Oil sector impairment data from SEC EDGAR filings', 168, 60000, 15.0)
ON CONFLICT(feed_name) DO NOTHING;
