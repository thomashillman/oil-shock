CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS series_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_key TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  source_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_series_points_series_observed
  ON series_points(series_key, observed_at);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_key TEXT NOT NULL UNIQUE,
  company_key TEXT,
  filed_at TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS filing_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_key TEXT NOT NULL,
  mention_key TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS impairment_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_key TEXT NOT NULL UNIQUE,
  rationale TEXT NOT NULL,
  impact_direction TEXT NOT NULL CHECK (impact_direction IN ('increase', 'decrease')),
  review_due_at TEXT NOT NULL,
  retired_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS signal_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  mismatch_score REAL NOT NULL,
  actionability_state TEXT NOT NULL CHECK (actionability_state IN ('none', 'watch', 'actionable')),
  coverage_confidence REAL NOT NULL,
  source_freshness_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signal_snapshots_generated
  ON signal_snapshots(generated_at);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS run_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL,
  evidence_key TEXT NOT NULL,
  evidence_group TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  contribution REAL NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_run_evidence_run
  ON run_evidence(run_key);

CREATE TABLE IF NOT EXISTS config_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
