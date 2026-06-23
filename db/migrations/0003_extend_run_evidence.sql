ALTER TABLE run_evidence ADD COLUMN evidence_classification TEXT NOT NULL DEFAULT 'confirming' CHECK (evidence_classification IN ('confirming', 'counterevidence', 'falsifier'));

ALTER TABLE run_evidence ADD COLUMN coverage_quality TEXT NOT NULL DEFAULT 'well' CHECK (coverage_quality IN ('well', 'weakly', 'not_covered'));

ALTER TABLE run_evidence ADD COLUMN evidence_group_label TEXT NOT NULL DEFAULT 'physical_reality' CHECK (evidence_group_label IN ('physical_reality', 'market_recognition', 'transmission_pressure'));
