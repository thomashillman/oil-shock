-- Stage 2 additive schema for Macro Signals transition.
-- Rollback steps:
--   1) Disable worker dual writes by unsetting ENABLE_SCORE_DUAL_WRITE.
--   2) If needed, archive rows from scores/feeds/engines/metrics/rules.
--   3) Drop additive tables in reverse dependency order:
--      DROP TABLE IF EXISTS scores;
--      DROP TABLE IF EXISTS rules;
--      DROP TABLE IF EXISTS metrics;
--      DROP TABLE IF EXISTS feeds;
--      DROP TABLE IF EXISTS engines;

CREATE TABLE IF NOT EXISTS engines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  feed_key TEXT NOT NULL,
  name TEXT NOT NULL,
  refresh_interval_seconds INTEGER,
  freshness_threshold_seconds INTEGER NOT NULL,
  unit TEXT,
  metadata_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, feed_key),
  FOREIGN KEY (engine_key) REFERENCES engines(engine_key)
);

CREATE INDEX IF NOT EXISTS idx_feeds_engine_key ON feeds(engine_key);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  name TEXT NOT NULL,
  expression TEXT,
  metadata_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, metric_key),
  FOREIGN KEY (engine_key) REFERENCES engines(engine_key)
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  predicate_json TEXT NOT NULL,
  weight REAL,
  action TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, rule_key),
  FOREIGN KEY (engine_key) REFERENCES engines(engine_key)
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  feed_key TEXT NOT NULL,
  scored_at TEXT NOT NULL,
  score_value REAL NOT NULL,
  confidence REAL,
  flags_json TEXT,
  snapshot_id INTEGER,
  run_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, feed_key, scored_at),
  FOREIGN KEY (engine_key) REFERENCES engines(engine_key)
);

CREATE INDEX IF NOT EXISTS idx_scores_engine_scored_at ON scores(engine_key, scored_at DESC);

INSERT OR IGNORE INTO engines (engine_key, name, description)
VALUES ('oil_shock', 'Oil Shock', 'Current single-engine dislocation scorer');

INSERT OR IGNORE INTO feeds (
  engine_key,
  feed_key,
  name,
  freshness_threshold_seconds,
  metadata_json
) VALUES
  ('oil_shock', 'price_signal.spot_wti', 'WTI Spot Price Signal', 259200, '{"dimension":"priceSignal"}'),
  ('oil_shock', 'price_signal.curve_slope', 'WTI Curve Slope Signal', 259200, '{"dimension":"priceSignal"}'),
  ('oil_shock', 'physical_stress.inventory_draw', 'US Crude Inventory Draw', 691200, '{"dimension":"physicalStress"}'),
  ('oil_shock', 'physical_stress.refinery_utilization', 'Refinery Utilization Stress', 691200, '{"dimension":"physicalStress"}'),
  ('oil_shock', 'physical_stress.eu_pipeline_flow', 'EU Pipeline Flow Stress', 691200, '{"dimension":"physicalStress"}'),
  ('oil_shock', 'physical_stress.eu_gas_storage', 'EU Gas Storage Stress', 691200, '{"dimension":"physicalStress"}'),
  ('oil_shock', 'market_response.crack_spread', 'Crack Spread Response', 691200, '{"dimension":"marketResponse"}'),
  ('oil_shock', 'market_response.sec_impairment', 'SEC Impairment Response', 691200, '{"dimension":"marketResponse"}');

-- Optional backfill support for dual-write rollout validation.
INSERT OR IGNORE INTO scores (
  engine_key,
  feed_key,
  scored_at,
  score_value,
  confidence,
  flags_json,
  snapshot_id,
  run_key
)
SELECT
  'oil_shock',
  'oil_shock.mismatch_score',
  generated_at,
  mismatch_score,
  coverage_confidence,
  json_object(
    'state', json_extract(dislocation_state_json, '$.state'),
    'actionabilityState', actionability_state,
    'sourceFreshness', json(source_freshness_json)
  ),
  id,
  run_key
FROM signal_snapshots;
