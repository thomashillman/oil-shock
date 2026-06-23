export interface Env {
  APP_ENV: "local" | "preview" | "production";
  PRODUCTION_ORIGIN?: string;
  ENABLE_MACRO_SIGNALS?: string;
  ENABLE_SCORE_DUAL_WRITE?: string;
  ENABLE_PHASE1_PARALLEL_RUNNING?: string;
  ENERGY_ROLLOUT_PERCENT?: string;
  ADMIN_API_BEARER_TOKEN?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  DB: D1Database;
  EIA_API_KEY: string;
  GIE_API_KEY: string;
}
