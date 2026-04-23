export interface Env {
  APP_ENV: "local" | "preview" | "production";
  PRODUCTION_ORIGIN?: string;
  ENABLE_MACRO_SIGNALS?: string;
  ENABLE_SCORE_DUAL_WRITE?: string;
  ENABLE_PHASE1_PARALLEL_RUNNING?: string;
  ADMIN_API_BEARER_TOKEN?: string;
  DB: D1Database;
  EIA_API_KEY: string;
  GIE_API_KEY: string;
}
