-- Energy score refactor: empirically anchored scoring constants.
-- Additive seed only; no existing rows are altered destructively.
--
-- These constants make the live Energy hidden-dislocation score decision-shaped:
--   * WTI-Brent basis is normalised against historical USD anchors rather than a
--     bare divisor, with a directional discount when WTI trades at a premium.
--   * Diesel-WTI crack is normalised against refining-margin USD anchors.
--   * Physical-supply feeds (inventory, refinery, EU gas storage) add a bounded
--     penalty to physical stress when they breach their 5-year seasonal baseline.
INSERT OR REPLACE INTO config_thresholds (key, value) VALUES
  -- WTI-Brent basis magnitude (USD/bbl): 0.0 at the post-2015 average spread,
  -- 1.0 at a spread wide enough to imply severe logistical bottlenecks.
  ('wti_brent_floor_usd', '3.5'),
  ('wti_brent_ceiling_usd', '15.0'),
  -- WTI premium (WTI > Brent) usually signals a domestic pipeline constraint
  -- rather than a global supply shock, so its stress contribution is discounted.
  ('wti_premium_discount', '0.5'),
  -- Diesel-WTI crack (USD/bbl): 0.0 at a healthy refining baseline, 1.0 at a
  -- crack wide enough to act as an early warning for structural product shortage.
  ('diesel_crack_floor_usd', '10.0'),
  ('diesel_crack_ceiling_usd', '40.0'),
  -- Each physical-supply feed below its 5-year seasonal baseline adds this much
  -- to physical stress before the [0,1] clamp.
  ('physical_baseline_penalty_weight', '0.1'),
  -- History window (years) used to build per-period seasonal baselines.
  ('seasonal_baseline_years', '5.0'),
  -- Number of most-recent observations averaged into the current reading that is
  -- compared against the seasonal baseline.
  ('physical_rolling_weeks', '4.0');
