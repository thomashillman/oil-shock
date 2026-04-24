import type { Env } from "../env";
import { json } from "../lib/http";
import { log } from "../lib/logging";
import { getRuntimeMode } from "../lib/feature-flags";

export interface HealthPayload {
  ok: boolean;
  service: string;
  env: Env["APP_ENV"];
  featureFlags: {
    macroSignals: boolean;
  };
  dependencies?: {
    database: {
      status: "healthy" | "unhealthy";
      latency_ms?: number;
    };
    config: {
      status: "healthy" | "unhealthy";
      threshold_count?: number;
    };
  };
  version?: string;
  timestamp?: string;
}

export async function handleGetHealth(env: Env): Promise<Response> {
  const startTime = Date.now();
  const payload: HealthPayload = {
    ok: true,
    service: "oil-shock-worker",
    env: env.APP_ENV,
    featureFlags: {
      macroSignals: getRuntimeMode(env) === "macro-signals"
    },
    timestamp: new Date().toISOString()
  };

  // Check D1 connectivity
  let databaseHealthy = true;
  let databaseLatency = 0;

  try {
    const dbStart = Date.now();
    const result = await env.DB.prepare("SELECT 1").first();
    databaseLatency = Date.now() - dbStart;

    if (!result) {
      databaseHealthy = false;
    }
  } catch (error) {
    databaseHealthy = false;
    log("warn", "Database health check failed", { error: String(error) });
  }

  // Check config thresholds availability
  let configHealthy = true;
  let thresholdCount = 0;

  try {
    const configResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM config_thresholds"
    ).first<{ count: number }>();

    thresholdCount = configResult?.count ?? 0;
    configHealthy = thresholdCount > 0;

    if (!configHealthy) {
      log("warn", "Config thresholds not found", { threshold_count: thresholdCount });
    }
  } catch (error) {
    configHealthy = false;
    log("warn", "Config health check failed", { error: String(error) });
  }

  // Determine overall health
  const overallHealthy = databaseHealthy && configHealthy;
  payload.ok = overallHealthy;
  payload.dependencies = {
    database: {
      status: databaseHealthy ? "healthy" : "unhealthy",
      latency_ms: databaseLatency
    },
    config: {
      status: configHealthy ? "healthy" : "unhealthy",
      threshold_count: thresholdCount
    }
  };

  // Use 503 Service Unavailable if any dependency is unhealthy
  const statusCode = overallHealthy ? 200 : 503;
  return json(payload, { status: statusCode });
}
