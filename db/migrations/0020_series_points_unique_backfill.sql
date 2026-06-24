-- Make historical source-series backfills idempotent without destructive deletes.
-- This supports GIE gas storage and any future source-backed replay imports.

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_points_unique_source_point
  ON series_points(series_key, observed_at, source_key);
