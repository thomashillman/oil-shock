-- Make historical source-series backfills idempotent without destructive deletes.
-- This supports GIE gas storage and any future source-backed replay imports.
-- Remove older duplicates for the same (series_key, observed_at, source_key).

DELETE FROM series_points AS sp
WHERE EXISTS (
  SELECT 1
  FROM series_points AS newer
  WHERE newer.series_key = sp.series_key
    AND newer.observed_at = sp.observed_at
    AND newer.source_key = sp.source_key
    AND newer.id > sp.id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_points_unique_source_point
  ON series_points(series_key, observed_at, source_key);
