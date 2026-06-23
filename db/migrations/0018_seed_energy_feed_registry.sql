-- Seed Energy feed registry rows for bridge-phase observation dual-write and feed-health reporting.
-- Idempotent by UNIQUE(engine_key, feed_key).

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
    'energy_spread.wti_brent_spread',
    'EIA',
    'EIA',
    'WTI-Brent Spread',
    'timeseries',
    86400,
    259200,
    'unknown',
    1,
    '{"bridge":"energy_registry_execution_v1"}'
  ),
  (
    'energy',
    'energy_spread.diesel_wti_crack',
    'EIA',
    'EIA',
    'Diesel-WTI Crack Spread',
    'timeseries',
    86400,
    259200,
    'unknown',
    1,
    '{"bridge":"energy_registry_execution_v1"}'
  );
