ALTER TABLE signal_snapshots ADD COLUMN run_key TEXT;

CREATE INDEX IF NOT EXISTS idx_signal_snapshots_run_key
  ON signal_snapshots(run_key);
