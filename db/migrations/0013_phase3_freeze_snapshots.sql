-- Phase 3: Archive Oil Shock era and freeze snapshots table
-- This migration is the point of no return for Oil Shock data collection.
-- Applied: 2026-04-24

-- Step 1: Create archive table for historical Oil Shock snapshots
CREATE TABLE IF NOT EXISTS signal_snapshots_archive_oil_shock AS
SELECT * FROM signal_snapshots;

-- Step 2: Backfill any Phase 1-2 snapshots not yet dual-written to scores table
-- This ensures complete historical record in the new schema
INSERT OR IGNORE INTO scores (
  engine_key,
  feed_key,
  scored_at,
  score_value,
  confidence,
  flags_json,
  snapshot_id,
  run_key,
  created_at
)
SELECT
  'oil_shock',
  'oil_shock.mismatch_score',
  ss.generated_at,
  ss.mismatch_score,
  ss.coverage_confidence,
  json_object(
    'state', ss.dislocation_state_json,
    'stateRationale', ss.state_rationale,
    'actionabilityState', ss.actionability_state,
    'subscores', ss.subscores_json,
    'clocks', ss.clocks_json,
    'ledgerImpact', ss.ledger_impact_json,
    'sourceFreshness', ss.source_freshness_json,
    'guardrailFlags', ss.guardrail_flags_json,
    'confidence', json_object(
      'coverage', ss.coverage_confidence,
      'sourceQuality', json_extract(ss.source_freshness_json, '$')
    ),
    'evidenceIds', ss.evidence_ids_json
  ),
  ss.id,
  ss.run_key,
  CURRENT_TIMESTAMP
FROM signal_snapshots ss
WHERE NOT EXISTS (
  SELECT 1 FROM scores WHERE snapshot_id = ss.id AND engine_key = 'oil_shock'
);

-- Step 3: Log the phase 3 cutover event
-- (This is a documentation note; actual status tracking would use a system log table)
-- Oil Shock collectors retired at 2026-04-24
-- Oil Shock scoring seam retired at 2026-04-24
-- Legacy routes archived (snapshot-backed API deprecated)
-- signal_snapshots table frozen - no new Oil Shock data collection
-- All current state sourced from scores table via Macro Signals engines
