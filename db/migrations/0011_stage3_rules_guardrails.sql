-- Stage 3 additive migration: rule seeds + guardrail flags on snapshots.
ALTER TABLE signal_snapshots ADD COLUMN guardrail_flags_json TEXT;

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
    'oilshock.recognition_gap_bonus',
    'Recognition gap confirmation bonus',
    '{"type":"all","predicates":[{"type":"threshold","metric":"physicalStress","operator":">=","value":0.6},{"type":"threshold","metric":"priceSignal","operator":"<=","value":0.45}]}',
    0.03,
    'adjust_mismatch',
    1
  ),
  (
    'oil_shock',
    'oilshock.market_confirmation_bonus',
    'Market transmission confirmation bonus',
    '{"type":"threshold","metric":"marketResponse","operator":">=","value":0.5}',
    0.02,
    'adjust_mismatch',
    1
  );
