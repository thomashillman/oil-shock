export interface Env {
  APP_ENV: "local" | "preview" | "production";
  PRODUCTION_ORIGIN?: string;
  DB: D1Database;
}
