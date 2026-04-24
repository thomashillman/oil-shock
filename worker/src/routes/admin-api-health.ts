import type { Env } from "../env";
import { json } from "../lib/http";
import { log } from "../lib/logging";
import { getFeedRegistry } from "../lib/api-instrumentation";

export interface PerFeedHealth {
  feedName: string;
  provider: string;
  displayName: string;
  status: "OK" | "ERROR" | "TIMEOUT" | "UNKNOWN";
  latencyP95Ms: number | null;
  errorRatePct: number;
  lastSuccessfulAt: string | null;
  lastAttemptedAt: string | null;
  attemptCount1h: number;
  successCount1h: number;
  failureCount1h: number;
  timeoutCount1h: number;
}

export interface ApiHealthResponse {
  generatedAt: string;
  systemHealthy: boolean;
  unhealthyFeeds: string[];
  feeds: PerFeedHealth[];
  summary: {
    totalFeeds: number;
    healthyFeeds: number;
    degradedFeeds: number;
    downFeeds: number;
  };
}

/**
 * Calculate P95 latency for a feed in the last hour.
 */
async function calculateLatencyP95(
  env: Env,
  feedName: string,
  provider: string
): Promise<number | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const rows = await env.DB.prepare(
    `
    SELECT latency_ms
    FROM api_health_metrics
    WHERE feed_name = ?
      AND provider = ?
      AND status = 'success'
      AND attempted_at >= ?
      AND latency_ms IS NOT NULL
    ORDER BY latency_ms ASC
    `
  )
    .bind(feedName, provider, oneHourAgo)
    .all<{ latency_ms: number }>();

  const latencies = (rows.results ?? []).map(r => r.latency_ms);

  if (latencies.length === 0) {
    return null;
  }

  // Simple P95 calculation: 95th percentile
  const index = Math.ceil(latencies.length * 0.95) - 1;
  return latencies[Math.max(0, index)] ?? null;
}

/**
 * Get aggregated metrics for a feed in the last hour.
 */
async function getFeedMetrics1h(
  env: Env,
  feedName: string,
  provider: string
): Promise<{
  attemptCount: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  errorRatePct: number;
  lastSuccessfulAt: string | null;
  lastAttemptedAt: string | null;
}> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const statsRow = await env.DB.prepare(
    `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure_count,
      SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
      MAX(CASE WHEN status = 'success' THEN attempted_at ELSE NULL END) as last_success,
      MAX(attempted_at) as last_attempted
    FROM api_health_metrics
    WHERE feed_name = ?
      AND provider = ?
      AND attempted_at >= ?
    `
  )
    .bind(feedName, provider, oneHourAgo)
    .first<{
      total: number;
      success_count: number;
      failure_count: number;
      timeout_count: number;
      last_success: string | null;
      last_attempted: string | null;
    }>();

  const total = statsRow?.total ?? 0;
  const successCount = statsRow?.success_count ?? 0;
  const failureCount = statsRow?.failure_count ?? 0;
  const timeoutCount = statsRow?.timeout_count ?? 0;

  const errorRatePct = total > 0
    ? ((failureCount + timeoutCount) / total) * 100
    : 0;

  return {
    attemptCount: total,
    successCount,
    failureCount,
    timeoutCount,
    errorRatePct,
    lastSuccessfulAt: statsRow?.last_success ?? null,
    lastAttemptedAt: statsRow?.last_attempted ?? null
  };
}

/**
 * Determine the health status for a feed.
 */
function determineStatus(
  lastAttemptedAt: string | null,
  lastSuccessfulAt: string | null,
  errorRatePct: number,
  freshnessWindowHours: number,
  errorRateThresholdPct: number
): "OK" | "ERROR" | "TIMEOUT" | "UNKNOWN" {
  // No attempts recorded
  if (!lastAttemptedAt) {
    return "UNKNOWN";
  }

  // If error rate exceeds threshold, it's in ERROR state
  if (errorRatePct > errorRateThresholdPct) {
    return "ERROR";
  }

  // Check if stale (no successful data within freshness window)
  if (!lastSuccessfulAt) {
    const hoursSinceAttempt = (Date.now() - new Date(lastAttemptedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceAttempt > freshnessWindowHours) {
      return "TIMEOUT";
    }
    return "ERROR";
  }

  const hoursSinceLast = (Date.now() - new Date(lastSuccessfulAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceLast > freshnessWindowHours) {
    return "TIMEOUT";
  }

  return "OK";
}

/**
 * GET /api/admin/api-health
 * Returns comprehensive API health metrics for all feeds.
 *
 * Used by:
 * - Grafana dashboard panels
 * - Admin UI status pages
 * - Alert rule evaluation
 */
export async function handleGetApiHealth(env: Env): Promise<Response> {
  try {
    const generatedAt = new Date().toISOString();
    const feedRegistry = await getFeedRegistry(env);

    const feeds: PerFeedHealth[] = [];
    let healthyCount = 0;
    let degradedCount = 0;
    let downCount = 0;
    const unhealthyFeeds: string[] = [];

    // Process each registered feed
    for (const feed of feedRegistry) {
      const metrics = await getFeedMetrics1h(env, feed.feedName, feed.provider);
      const latencyP95 = await calculateLatencyP95(env, feed.feedName, feed.provider);

      const status = determineStatus(
        metrics.lastAttemptedAt,
        metrics.lastSuccessfulAt,
        metrics.errorRatePct,
        feed.freshnessWindowHours,
        feed.errorRateThresholdPct
      );

      const feedHealth: PerFeedHealth = {
        feedName: feed.feedName,
        provider: feed.provider,
        displayName: feed.displayName,
        status,
        latencyP95Ms: latencyP95,
        errorRatePct: Math.round(metrics.errorRatePct * 100) / 100,
        lastSuccessfulAt: metrics.lastSuccessfulAt,
        lastAttemptedAt: metrics.lastAttemptedAt,
        attemptCount1h: metrics.attemptCount,
        successCount1h: metrics.successCount,
        failureCount1h: metrics.failureCount,
        timeoutCount1h: metrics.timeoutCount
      };

      feeds.push(feedHealth);

      // Categorize health
      if (status === "OK") {
        healthyCount++;
      } else if (status === "ERROR") {
        degradedCount++;
        unhealthyFeeds.push(feed.displayName);
      } else if (status === "TIMEOUT") {
        downCount++;
        unhealthyFeeds.push(feed.displayName);
      }
    }

    const systemHealthy = unhealthyFeeds.length === 0;

    const response: ApiHealthResponse = {
      generatedAt,
      systemHealthy,
      unhealthyFeeds,
      feeds: feeds.sort((a, b) => a.feedName.localeCompare(b.feedName)),
      summary: {
        totalFeeds: feedRegistry.length,
        healthyFeeds: healthyCount,
        degradedFeeds: degradedCount,
        downFeeds: downCount
      }
    };

    return json(response, { status: systemHealthy ? 200 : 503 });
  } catch (error) {
    log("error", "API health check failed", { error: String(error) });
    return json(
      {
        error: "Failed to gather API health metrics",
        message: String(error)
      },
      { status: 500 }
    );
  }
}
