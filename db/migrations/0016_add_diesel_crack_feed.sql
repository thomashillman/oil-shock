-- Add missing diesel WTI crack spread feed to api_feed_registry
-- This feed is collected by the energy collector but wasn't in the initial registry

INSERT INTO api_feed_registry (
  feed_name,
  provider,
  display_name,
  description,
  freshness_window_hours,
  timeout_threshold_ms,
  error_rate_threshold_pct
) VALUES
  ('eia_diesel_wti_crack', 'EIA', 'EIA Diesel WTI Crack Spread', 'Diesel-WTI crack spread from Energy Information Administration', 24, 30000, 10.0)
ON CONFLICT(feed_name) DO NOTHING;
