export interface Env {
  APP_ENV: "local" | "preview" | "production";
  PRODUCTION_ORIGIN?: string;
  ENABLE_MACRO_SIGNALS?: string;
  DB: D1Database;
  EIA_API_KEY: string;
  GIE_API_KEY: string;
}
