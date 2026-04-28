-- Seed CPI feed registry row for collect-only bridge validation.
-- Disabled by default and idempotent via UNIQUE(engine_key, feed_key).

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
) VALUES (
  'cpi',
  'macro_release.us_cpi.all_items_index',
  'BLS',
  'BLS',
  'US CPI All Items Index',
  'macro_release',
  2592000,
  3456000,
  'unknown',
  0,
  '{"bridge":"cpi_collect_only_v1"}'
);
