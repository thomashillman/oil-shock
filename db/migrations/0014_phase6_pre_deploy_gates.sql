-- Phase 6A: Pre-deployment gate system
-- Tracks validation gates and sign-offs required before feature flag flips

-- Rollback:
--   DROP TABLE IF EXISTS pre_deploy_gates;
--   DROP TABLE IF EXISTS gate_sign_off_history;

CREATE TABLE IF NOT EXISTS pre_deploy_gates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_name TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'SIGNED_OFF', 'EXPIRED')),
  signed_off_by TEXT,
  signed_off_at TEXT,
  expires_at TEXT,
  notes TEXT,
  last_validated_at TEXT,
  validation_result TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(flag_name, gate_name)
);

CREATE TABLE IF NOT EXISTS gate_sign_off_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_name TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  signed_off_by TEXT NOT NULL,
  signed_off_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pre_deploy_gates_flag_status
  ON pre_deploy_gates(flag_name, status);

CREATE INDEX IF NOT EXISTS idx_pre_deploy_gates_expires
  ON pre_deploy_gates(expires_at);

CREATE INDEX IF NOT EXISTS idx_gate_sign_off_history_flag_gate
  ON gate_sign_off_history(flag_name, gate_name, signed_off_at DESC);

-- Initialize gates for ENABLE_MACRO_SIGNALS flag (Phase 6A)
INSERT OR IGNORE INTO pre_deploy_gates (flag_name, gate_name, status, notes, created_at, updated_at)
VALUES
  ('ENABLE_MACRO_SIGNALS', 'energy_determinism', 'PENDING', 'Energy scorer produces identical output for identical inputs', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ENABLE_MACRO_SIGNALS', 'energy_data_freshness', 'PENDING', 'Collector produces consistent data (variance < 5%)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ENABLE_MACRO_SIGNALS', 'energy_rule_consistency', 'PENDING', 'Rules adjust scores correctly and deterministically', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ENABLE_MACRO_SIGNALS', 'energy_guardrail_correctness', 'PENDING', 'Guardrails correctly flag stale/missing data', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ENABLE_MACRO_SIGNALS', 'health_endpoint_schema', 'PENDING', 'Health endpoint schema backward compatible', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ENABLE_MACRO_SIGNALS', 'rollout_monitoring_ready', 'PENDING', 'Observability dashboard configured and alerting active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
