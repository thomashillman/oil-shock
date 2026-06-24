-- The run_evidence columns are introduced in 0002_live_contract.sql.
-- Keep this migration as a no-op placeholder so the sequence remains stable
-- for environments that already recorded it, without re-adding duplicate
-- columns on fresh databases.
SELECT 1;
