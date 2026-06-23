CREATE TABLE IF NOT EXISTS state_change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT NOT NULL,
  state_transition_duration_seconds INTEGER,
  transmission_pressure_changed BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_state_change_events_generated
  ON state_change_events(generated_at);
