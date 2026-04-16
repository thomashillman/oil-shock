ALTER TABLE signal_snapshots ADD COLUMN dislocation_state_json TEXT NOT NULL DEFAULT '"aligned"';

ALTER TABLE signal_snapshots ADD COLUMN state_rationale TEXT NOT NULL DEFAULT '';

ALTER TABLE signal_snapshots ADD COLUMN subscores_json TEXT NOT NULL DEFAULT '{"physical":0,"recognition":0,"transmission":0}';

ALTER TABLE signal_snapshots ADD COLUMN clocks_json TEXT NOT NULL DEFAULT '{"shock":{"ageSeconds":0,"label":"unknown","classification":"acute"},"dislocation":{"ageSeconds":0,"label":"unknown","classification":"acute"},"transmission":{"ageSeconds":0,"label":"unknown","classification":"acute"}}';

ALTER TABLE signal_snapshots ADD COLUMN ledger_impact_json TEXT;
