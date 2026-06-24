-- Fix incomplete config_thresholds seed from 0006
-- Ensures all 20 required thresholds are present
INSERT OR REPLACE INTO config_thresholds (key, value) VALUES
  ('mismatch_market_response_weight', '0.15'),
  ('confirmation_physical_stress_min', '0.6'),
  ('confirmation_price_signal_max', '0.45'),
  ('confirmation_market_response_min', '0.5'),
  ('coverage_missing_penalty', '0.34'),
  ('coverage_stale_penalty', '0.16'),
  ('coverage_max_penalty', '1.0'),
  ('state_deep_persistence_hours', '120'),
  ('state_persistent_persistence_hours', '72'),
  ('ledger_stale_threshold_days', '30');
