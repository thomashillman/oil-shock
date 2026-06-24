-- Disable feeds that have no collector implementation.
-- These were aspirational registrations seeded in 0015_api_health_tracking.sql
-- but no collection code was ever written for them.
-- They are disabled rather than deleted so they can be re-enabled when a
-- corresponding collector is implemented and wired into runCollection().
--
-- eia_futures_curve additionally maps to the price_signal.curve_slope series
-- read during Energy scoring (score.ts). Scoring degrades gracefully when
-- curve_slope is absent (confidence 0.6, missing_price_confirmation flag).
-- Implement the futures curve collector before re-enabling this feed.
UPDATE api_feed_registry
SET enabled = 0, updated_at = CURRENT_TIMESTAMP
WHERE feed_name IN (
  'eia_inventory',
  'eia_refinery',
  'eia_futures_curve',
  'enia_pipeline',
  'gie_storage',
  'sec_impairment'
);
