-- Re-enable feeds in api_feed_registry that have since had collectors implemented
-- and been enabled in feed_registry (Macro Signals) via migrations 0021-0023.
--
-- These were disabled by migration 0020 when no collection code existed.
-- Collectors are now implemented and wired into runCollection():
--   eia_futures_curve  -> collectors/eia-futures-curve.ts -> price_signal.curve_slope
--   gia_storage        -> collectors/gie.ts               -> physical_stress.eu_gas_storage
--   eia_refinery       -> collectors/eia-refinery.ts      -> physical_stress.refinery_utilization
--   eia_inventory      -> collectors/eia-inventory.ts     -> physical_stress.inventory_draw
--
-- enia_pipeline and sec_impairment remain disabled: no collectors exist for them.
--
-- Re-enabling these rows restores health tracking visibility for instrumentedFetch()
-- calls already being made by each collector.

UPDATE api_feed_registry
SET enabled = 1, updated_at = CURRENT_TIMESTAMP
WHERE feed_name IN (
  'eia_futures_curve',
  'gie_storage',
  'eia_refinery',
  'eia_inventory'
);
