-- Stage 4 additive migration: seed candidate Macro Signals engines, feeds, metrics, and initial rules.
-- Rollback:
--   DELETE FROM rules WHERE engine_key IN ('energy', 'macro_releases');
--   DELETE FROM metrics WHERE engine_key IN ('energy', 'macro_releases');
--   DELETE FROM feeds WHERE engine_key IN ('energy', 'macro_releases');
--   DELETE FROM engines WHERE engine_key IN ('energy', 'macro_releases');

INSERT OR IGNORE INTO engines (engine_key, name, description) VALUES
  ('energy', 'Energy Spreads', 'Cross-product spread stress engine using price spreads and transmission confirmation'),
  ('macro_releases', 'Macro Releases', 'Macroeconomic release surprise engine (initial metadata seed)');

INSERT OR IGNORE INTO feeds (
  engine_key,
  feed_key,
  name,
  refresh_interval_seconds,
  freshness_threshold_seconds,
  unit,
  metadata_json
) VALUES
  (
    'energy',
    'energy_spread.wti_brent_spread',
    'WTI vs Brent spread stress',
    86400,
    259200,
    'index',
    '{"dimension":"physicalStress","collector":"energy","source":"eia"}'
  ),
  (
    'energy',
    'energy_spread.diesel_wti_crack',
    'Diesel vs WTI crack spread stress',
    86400,
    259200,
    'index',
    '{"dimension":"marketResponse","collector":"energy","source":"eia"}'
  ),
  (
    'macro_releases',
    'macro_release.us_cpi_surprise',
    'US CPI surprise magnitude',
    2592000,
    3456000,
    'index',
    '{"dimension":"priceSignal","collector":"macro_release","source":"bls"}'
  );

INSERT OR IGNORE INTO metrics (
  engine_key,
  metric_key,
  name,
  expression,
  metadata_json
) VALUES
  (
    'energy',
    'energy.stress_index',
    'Energy spread stress index',
    'avg(energy_spread.wti_brent_spread, energy_spread.diesel_wti_crack)',
    '{"notes":"Stage 4 seed metric for score traceability"}'
  ),
  (
    'macro_releases',
    'macro.inflation_surprise',
    'Inflation surprise magnitude',
    'macro_release.us_cpi_surprise',
    '{"notes":"Stage 4 seed metric; collector deferred"}'
  );

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
    'energy',
    'energy.confirmation.spread_widening',
    'Energy spread widening confirmation',
    '{"type":"all","predicates":[{"type":"threshold","metric":"physicalStress","operator":">=","value":0.55},{"type":"threshold","metric":"marketResponse","operator":">=","value":0.5}]}',
    0.04,
    'adjust_mismatch',
    1
  ),
  (
    'energy',
    'energy.confirmation.curve_lag',
    'Curve lag confirmation via Oil Shock price signal',
    '{"type":"threshold","metric":"priceSignal","operator":"<=","value":0.5}',
    0.02,
    'adjust_mismatch',
    1
  );
