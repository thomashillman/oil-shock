-- Fix evidence_group_label CHECK constraint to match updated taxonomy
-- Old labels: physical_reality, market_recognition, transmission_pressure
-- New labels: physical_stress_indicator, price_signal_pressure, market_response_pressure

-- Create new table with updated constraint
CREATE TABLE run_evidence_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL,
  evidence_key TEXT NOT NULL,
  evidence_group TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  contribution REAL NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evidence_classification TEXT NOT NULL DEFAULT 'confirming' CHECK (evidence_classification IN ('confirming', 'counterevidence', 'falsifier')),
  coverage_quality TEXT NOT NULL DEFAULT 'well' CHECK (coverage_quality IN ('well', 'weakly', 'not_covered')),
  evidence_group_label TEXT NOT NULL DEFAULT 'physical_stress_indicator' CHECK (evidence_group_label IN ('physical_stress_indicator', 'price_signal_pressure', 'market_response_pressure'))
);

-- Copy existing data
INSERT INTO run_evidence_new (id, run_key, evidence_key, evidence_group, observed_at, contribution, details_json, created_at, evidence_classification, coverage_quality, evidence_group_label)
SELECT id, run_key, evidence_key, evidence_group, observed_at, contribution, details_json, created_at, evidence_classification, coverage_quality, evidence_group_label
FROM run_evidence;

-- Drop old table and rename new one
DROP TABLE run_evidence;
ALTER TABLE run_evidence_new RENAME TO run_evidence;
