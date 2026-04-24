import type { Env } from "../env";
import { log } from "./logging";

export interface ApiHealthMetric {
  feedName: string;
  provider: string;
  status: "success" | "failure" | "timeout";
  latencyMs: number;
  errorMessage?: string;
  attemptedAt: string;
}

/**
 * Records an API health metric to the database.
 * This is the low-level instrumentation function.
 */
export async function recordApiHealthMetric(
  env: Env,
  metric: ApiHealthMetric
): Promise<void> {
  try {
    await env.DB.prepare(
      `
      INSERT INTO api_health_metrics (
        feed_name,
        provider,
        status,
        latency_ms,
        error_message,
        attempted_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        metric.feedName,
        metric.provider,
        metric.status,
        metric.latencyMs,
        metric.errorMessage || null,
        metric.attemptedAt
      )
      .run();
  } catch (error) {
    // Silently log instrumentation failures - don't break the main flow
    log("warn", "Failed to record API health metric", {
      feedName: metric.feedName,
      error: String(error)
    });
  }
}

export interface InstrumentedFetchOptions {
  timeout?: number;
  retries?: number;
  backoffMs?: number;
  rateLimitDelayMs?: number;
  headers?: Record<string, string>;
}

/**
 * Wraps a fetch operation with API health instrumentation.
 * Automatically records success/failure/timeout events.
 * Returns the parsed JSON response and records metrics.
 */
export async function instrumentedFetch<T>(
  env: Env,
  url: string,
  feedName: string,
  provider: string,
  options: InstrumentedFetchOptions = {}
): Promise<T> {
  const startTime = Date.now();
  const attemptedAt = new Date().toISOString();
  const {
    timeout = 30000,
    retries = 0,
    backoffMs = 2000,
    rateLimitDelayMs = 150,
    headers = {}
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Rate limit delay: respects per-request rate limiting without global state
      if (attempt > 0 && rateLimitDelayMs > 0) {
        await sleep(rateLimitDelayMs);
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          ...headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as T;
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      // Record success
      await recordApiHealthMetric(env, {
        feedName,
        provider,
        status: "success",
        latencyMs,
        attemptedAt
      });

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a timeout
      if (lastError.name === "AbortError") {
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        // Record timeout
        await recordApiHealthMetric(env, {
          feedName,
          provider,
          status: "timeout",
          latencyMs,
          errorMessage: "Request timeout",
          attemptedAt
        });

        throw new Error(`API request timeout for ${feedName} after ${timeout}ms`);
      }

      if (attempt < retries) {
        const delayMs = backoffMs * Math.pow(2, attempt);
        log("warn", `API fetch attempt ${attempt + 1} failed, retrying`, {
          feedName,
          url,
          error: lastError.message,
          nextAttempt: attempt + 2
        });
        await sleep(delayMs);
      }
    }
  }

  clearTimeout(timeoutId);
  const latencyMs = Date.now() - startTime;

  // Record failure after all retries exhausted
  await recordApiHealthMetric(env, {
    feedName,
    provider,
    status: "failure",
    latencyMs,
    errorMessage: lastError?.message || "Unknown error",
    attemptedAt
  });

  throw lastError ?? new Error(`Failed to fetch ${feedName} from ${url} after ${retries + 1} attempts`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the feed registry from the database.
 * Used for dashboard configuration and alert rule templates.
 */
export async function getFeedRegistry(env: Env): Promise<Array<{
  feedName: string;
  provider: string;
  displayName: string;
  description: string;
  freshnessWindowHours: number;
  timeoutThresholdMs: number;
  errorRateThresholdPct: number;
  enabled: boolean;
}>> {
  const rows = await env.DB.prepare(
    `
    SELECT
      feed_name,
      provider,
      display_name,
      description,
      freshness_window_hours,
      timeout_threshold_ms,
      error_rate_threshold_pct,
      enabled
    FROM api_feed_registry
    WHERE enabled = 1
    ORDER BY feed_name
    `
  )
    .all<{
      feed_name: string;
      provider: string;
      display_name: string;
      description: string;
      freshness_window_hours: number;
      timeout_threshold_ms: number;
      error_rate_threshold_pct: number;
      enabled: number;
    }>();

  return (rows.results ?? []).map(row => ({
    feedName: row.feed_name,
    provider: row.provider,
    displayName: row.display_name,
    description: row.description,
    freshnessWindowHours: row.freshness_window_hours,
    timeoutThresholdMs: row.timeout_threshold_ms,
    errorRateThresholdPct: row.error_rate_threshold_pct,
    enabled: Boolean(row.enabled)
  }));
}

/**
 * Get the latest health status for a specific feed.
 * Useful for quick status checks in admin panels.
 */
export async function getLatestFeedStatus(
  env: Env,
  feedName: string
): Promise<{
  status: "success" | "failure" | "timeout" | "unknown";
  latencyMs: number | null;
  errorMessage: string | null;
  attemptedAt: string | null;
} | null> {
  const row = await env.DB.prepare(
    `
    SELECT status, latency_ms, error_message, attempted_at
    FROM api_health_metrics
    WHERE feed_name = ?
    ORDER BY attempted_at DESC
    LIMIT 1
    `
  )
    .bind(feedName)
    .first<{
      status: string;
      latency_ms: number | null;
      error_message: string | null;
      attempted_at: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    status: row.status as "success" | "failure" | "timeout",
    latencyMs: row.latency_ms,
    errorMessage: row.error_message,
    attemptedAt: row.attempted_at
  };
}
