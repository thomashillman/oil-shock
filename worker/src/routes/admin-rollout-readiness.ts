/**
 * Phase 6A Rollout Readiness Admin Endpoint
 *
 * GET /api/admin/rollout-readiness
 *
 * Returns a structured readiness assessment for Energy rollout canary phase.
 * This evaluates ONLY the Phase 6A required Energy feeds, not all seeded feeds.
 * This is a read-only endpoint that aggregates existing telemetry, validation,
 * and gate data to help operators decide if rollout can proceed.
 *
 * Does NOT:
 * - Change configuration or rollout percentage
 * - Perform deployment
 * - Make external network calls
 * - Claim live verification (only code-checkable items)
 */

import type { Env } from "../env";
import { json } from "../lib/http";
import { log } from "../lib/logging";
import { evaluateReadiness, type ReadinessEvidence } from "../core/rollout/readiness";
import { getEnergyRolloutPercent } from "../lib/feature-flags";
import { getGateStatus } from "../db/client";
import { getFeedRegistry } from "../lib/api-instrumentation";

// Phase 6A required feeds for Energy rollout canary decision
const PHASE_6A_REQUIRED_FEEDS = ["eia_wti", "eia_brent", "eia_diesel_wti_crack"];

/**
 * Evaluate API health for Phase 6A required feeds only.
 * Non-required seeded feeds do not block Phase 6A readiness.
 */
async function getApiHealthSummary(
  env: Env
): Promise<{
  systemHealthy: boolean;
  unhealthyFeeds: string[];
  totalFeeds: number;
  healthyFeeds: number;
}> {
  try {
    const allFeeds = await getFeedRegistry(env);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Filter to only Phase 6A required feeds
    const requiredFeeds = allFeeds.filter((f) =>
      PHASE_6A_REQUIRED_FEEDS.includes(f.feedName)
    );

    // Check that all required feeds are registered
    const registeredFeedNames = new Set(requiredFeeds.map((f) => f.feedName));
    const missingFeeds = PHASE_6A_REQUIRED_FEEDS.filter(
      (f) => !registeredFeedNames.has(f)
    );
    if (missingFeeds.length > 0) {
      return {
        systemHealthy: false,
        unhealthyFeeds: missingFeeds.map((f) => `${f} (missing from registry)`),
        totalFeeds: PHASE_6A_REQUIRED_FEEDS.length,
        healthyFeeds: 0
      };
    }

    let healthyCount = 0;
    const unhealthyFeeds: string[] = [];

    for (const feed of requiredFeeds) {
      // Get metrics for this feed
      const statsRow = await env.DB.prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status = 'failure' OR status = 'timeout' THEN 1 ELSE 0 END) as failure_count,
          MAX(CASE WHEN status = 'success' THEN attempted_at ELSE NULL END) as last_success
        FROM api_health_metrics
        WHERE feed_name = ?
          AND provider = ?
          AND attempted_at >= ?
        `
      )
        .bind(feed.feedName, feed.provider, oneHourAgo)
        .first<{
          total: number;
          success_count: number;
          failure_count: number;
          last_success: string | null;
        }>();

      const total = statsRow?.total ?? 0;
      const failureCount = statsRow?.failure_count ?? 0;
      const errorRatePct = total > 0 ? (failureCount / total) * 100 : 0;

      // Determine health: OK if error rate is low and data is fresh
      const lastSuccess = statsRow?.last_success;
      const hoursSinceLast = lastSuccess
        ? (Date.now() - new Date(lastSuccess).getTime()) / (1000 * 60 * 60)
        : Infinity;

      const isFresh = hoursSinceLast <= feed.freshnessWindowHours;
      const isHealthy = isFresh && errorRatePct <= feed.errorRateThresholdPct;

      if (isHealthy) {
        healthyCount++;
      } else {
        unhealthyFeeds.push(feed.feedName);
      }
    }

    return {
      systemHealthy: unhealthyFeeds.length === 0,
      unhealthyFeeds,
      totalFeeds: PHASE_6A_REQUIRED_FEEDS.length,
      healthyFeeds: healthyCount
    };
  } catch (error) {
    log("error", "Failed to calculate API health summary", {
      error: String(error)
    });
    // Conservative: treat error as unhealthy
    return {
      systemHealthy: false,
      unhealthyFeeds: ["error-calculating-health"],
      totalFeeds: 0,
      healthyFeeds: 0
    };
  }
}

/**
 * GET /api/admin/rollout-readiness
 *
 * Returns readiness assessment with:
 * - status: "ready" | "warning" | "blocked"
 * - blockers: critical issues preventing rollout
 * - warnings: non-blocking concerns (stale data, etc.)
 * - manualChecks: items operator must verify (Grafana, alerts, staging, rollback)
 * - evidence: aggregated input data
 * - generatedAt: timestamp of assessment
 */
export async function handleGetRolloutReadiness(env: Env): Promise<Response> {
  try {
    const now = new Date().toISOString();

    // Gather evidence from multiple sources
    const apiHealth = await getApiHealthSummary(env);

    const gates = await getGateStatus(env, "ENABLE_MACRO_SIGNALS");
    const gatesStatus = {
      passedCount: gates.filter((g) => g.status === "SIGNED_OFF").length,
      totalCount: gates.length,
      allSigned: gates.every((g) => g.status === "SIGNED_OFF")
    };

    // Validation: simplify by checking if gates are ready
    // (This mirrors the validation endpoint logic)
    const validation = {
      allValidationsPassed: gates.every((g) => g.status === "SIGNED_OFF"),
      readyForRollout: !gates.some((g) => g.status === "EXPIRED"),
      gates: gates.map((g) => ({
        gate: g.gate_name,
        status:
          g.status === "SIGNED_OFF"
            ? ("passed" as const)
            : g.status === "EXPIRED"
              ? ("failed" as const)
              : ("pending" as const)
      }))
    };

    const rolloutPercent = getEnergyRolloutPercent(env);

    // Assemble evidence
    const evidence: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent,
      apiHealth,
      validation,
      gates: gatesStatus
    };

    // Evaluate readiness
    const result = evaluateReadiness(evidence, now);

    return json(result);
  } catch (error) {
    log("error", "Failed to evaluate rollout readiness", {
      error: String(error)
    });

    // Return a blocked status on error (conservative)
    return json(
      {
        status: "blocked" as const,
        blockers: ["Failed to evaluate readiness: error gathering evidence"],
        warnings: [],
        manualChecks: [],
        evidence: null,
        generatedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
