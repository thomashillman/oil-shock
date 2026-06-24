-- Seed the live EIA inventory and futures curve feeds for the current Energy bridge.
-- Idempotent via UNIQUE(engine_key, feed_key).

INSERT OR IGNORE INTO feed_registry (
  engine_key,
  feed_key,
  source_name,
  provider,
  display_name,
  parser_type,
  cadence_seconds,
  freshness_window_seconds,
  status,
  enabled,
  metadata_json
) VALUES
  (
    'energy',
    'physical_stress.inventory_draw',
    'EIA',
    'EIA',
    'US Crude Inventory Draw',
    'timeseries',
    604800,
    691200,
    'unknown',
    1,
    '{"bridge":"eia_inventory_weekly_collect_v1"}'
  ),
  (
    'energy',
    'price_signal.curve_slope',
    'EIA',
    'EIA',
    'WTI Futures Curve Slope',
    'timeseries',
    86400,
    259200,
    'unknown',
    1,
    '{"bridge":"eia_futures_curve_daily_collect_v1"}'
  );
