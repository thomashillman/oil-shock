-- One-time repair for the production database created before
-- 0002_live_contract.sql became the canonical owner of the live-contract
-- columns. Production already has those columns through the historically
-- applied 0003/0005 migrations, so only create the missing rules objects and
-- mark 0002_live_contract.sql as equivalent before normal migrations resume.

ALTER TABLE signal_snapshots ADD COLUMN guardrail_flags_json TEXT;

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

INSERT INTO d1_migrations (name)
SELECT '0002_live_contract.sql'
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0002_live_contract.sql'
);
