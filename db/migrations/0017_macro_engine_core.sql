-- Macro Core Schema v1 additive foundation.
-- Rollback steps:
--   1) Ensure no runtime writers depend on these tables.
--   2) Archive rows from rendered_outputs/action_log/trigger_events/rule_state/observations/feed_checks/feed_registry.
--   3) Drop additive tables in reverse dependency order.

CREATE TABLE IF NOT EXISTS feed_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  feed_key TEXT NOT NULL,
  provider TEXT,
  display_name TEXT,
  cadence_seconds INTEGER,
  freshness_window_seconds INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, feed_key)
);

CREATE INDEX IF NOT EXISTS idx_feed_registry_engine_key ON feed_registry(engine_key);

CREATE TABLE IF NOT EXISTS feed_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  feed_key TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER,
  error_message TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feed_checks_engine_feed_checked_at
  ON feed_checks(engine_key, feed_key, checked_at DESC);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  feed_key TEXT NOT NULL,
  series_key TEXT NOT NULL,
  release_key TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  value REAL NOT NULL,
  revised_value REAL,
  unit TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, feed_key, series_key, release_key, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_observations_engine_feed_as_of
  ON observations(engine_key, feed_key, as_of_date DESC);

CREATE TABLE IF NOT EXISTS rule_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  state_key TEXT NOT NULL,
  release_key TEXT,
  state_json TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, rule_key, state_key)
);

CREATE INDEX IF NOT EXISTS idx_rule_state_engine_rule
  ON rule_state(engine_key, rule_key);

CREATE TABLE IF NOT EXISTS trigger_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  release_key TEXT NOT NULL,
  transition_key TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, rule_key, release_key, transition_key)
);

CREATE INDEX IF NOT EXISTS idx_trigger_events_engine_rule_triggered_at
  ON trigger_events(engine_key, rule_key, triggered_at DESC);

CREATE TABLE IF NOT EXISTS action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  rule_key TEXT,
  release_key TEXT,
  decision_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  rationale TEXT,
  decided_at TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, decision_key)
);

CREATE INDEX IF NOT EXISTS idx_action_log_engine_decided_at
  ON action_log(engine_key, decided_at DESC);

CREATE TABLE IF NOT EXISTS rendered_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  output_key TEXT NOT NULL,
  release_key TEXT,
  markdown_body TEXT,
  content_json TEXT,
  rendered_at TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (engine_key, output_key, release_key, rendered_at)
);

CREATE INDEX IF NOT EXISTS idx_rendered_outputs_engine_output
  ON rendered_outputs(engine_key, output_key, rendered_at DESC);
