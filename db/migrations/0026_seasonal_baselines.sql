-- Seasonal-baseline storage for physical-supply feeds.
--
-- Each physical feed (crude inventory, refinery utilisation, EU gas storage) has
-- a strong seasonal shape. To decide whether a current reading is genuinely tight
-- we compare it against the same period in prior years rather than an absolute
-- level. Collectors compute per-period averages from ~5 years of raw history and
-- upsert them here; scoring reads the derived breach flags from series_points.
--
-- period_key is granularity-dependent and opaque to SQL:
--   * weekly / daily feeds -> ISO week-of-year, e.g. "W01".."W53"
--   * monthly feeds         -> month-of-year, e.g. "M01".."M12"
CREATE TABLE IF NOT EXISTS seasonal_baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  baseline_value REAL NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (feed_key, period_key)
);

CREATE INDEX IF NOT EXISTS idx_seasonal_baselines_feed ON seasonal_baselines (feed_key);
