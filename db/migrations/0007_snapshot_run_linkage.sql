-- run_key is added by 0002_live_contract.sql.
CREATE INDEX IF NOT EXISTS idx_signal_snapshots_run_key
  ON signal_snapshots(run_key);
