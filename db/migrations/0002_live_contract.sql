-- Extend the snapshot schema for the live dashboard contract and add editable rules.

ALTER TABLE signal_snapshots ADD COLUMN dislocation_state_json TEXT;
ALTER TABLE signal_snapshots ADD COLUMN state_rationale TEXT;
ALTER TABLE signal_snapshots ADD COLUMN subscores_json TEXT;
ALTER TABLE signal_snapshots ADD COLUMN clocks_json TEXT;
ALTER TABLE signal_snapshots ADD COLUMN ledger_impact_json TEXT;
ALTER TABLE signal_snapshots ADD COLUMN guardrail_flags_json TEXT;
ALTER TABLE signal_snapshots ADD COLUMN run_key TEXT;

ALTER TABLE run_evidence ADD COLUMN evidence_classification TEXT;
ALTER TABLE run_evidence ADD COLUMN coverage_quality TEXT;
ALTER TABLE run_evidence ADD COLUMN evidence_group_label TEXT;

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  predicate_json TEXT NOT NULL,
  weight REAL NOT NULL,
  action TEXT NOT NULL DEFAULT 'adjust_mismatch',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(engine_key, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_rules_engine_active
  ON rules(engine_key, is_active);

INSERT OR IGNORE INTO rules (
  engine_key,
  rule_key,
  name,
  predicate_json,
  weight,
  action,
  is_active
) VALUES
  (
    'oil_shock',
    'oil_shock.physical_stress_watch',
    'Physical stress watch',
    '{"type":"threshold","metric":"physicalStress","operator":">=","value":0.6}',
    0.03,
    'adjust_mismatch',
    1
  ),
  (
    'oil_shock',
    'oil_shock.market_response_confirmation',
    'Market response confirmation',
    '{"type":"threshold","metric":"marketResponse","operator":">=","value":0.5}',
    0.02,
    'adjust_mismatch',
    1
  );
