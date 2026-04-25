/**
 * Phase 6A Rollout Readiness Evaluator
 *
 * Pure module that evaluates whether Energy rollout can move from preparation
 * into the 10% canary phase, based on existing telemetry and gate status.
 *
 * This is a read-only evidence layer. It does not:
 * - Perform deployment
 * - Change rollout percentages
 * - Modify configuration
 * - Make network calls
 * - Claim live verification (only code-checkable items)
 */

export interface ApiHealthSummary {
  systemHealthy: boolean;
  unhealthyFeeds: string[];
  totalFeeds: number;
  healthyFeeds: number;
}

export interface ValidationGate {
  gate: string;
  status: "passed" | "pending" | "failed";
}

export interface ValidationStatus {
  allValidationsPassed: boolean;
  readyForRollout: boolean;
  gates: ValidationGate[];
}

export interface GatesStatus {
  passedCount: number;
  totalCount: number;
  allSigned: boolean;
}

export interface ReadinessEvidence {
  generatedAt: string;
  rolloutPercent: number;
  apiHealth: ApiHealthSummary;
  validation: ValidationStatus;
  gates: GatesStatus;
}

export interface ManualCheck {
  title: string;
  description: string;
  status: "pending" | "completed";
}

export interface ReadinessResult {
  status: "ready" | "warning" | "blocked";
  blockers: string[];
  warnings: string[];
  manualChecks: ManualCheck[];
  evidence: ReadinessEvidence;
  generatedAt: string;
}

/**
 * Evaluate rollout readiness based on existing evidence.
 *
 * Returns:
 * - "ready": All conditions met, code-level checks pass, manual items remain
 * - "warning": Some evidence is stale/incomplete, but not blocked
 * - "blocked": Critical failures prevent rollout
 *
 * Always includes manual checks that code cannot verify (Grafana import,
 * alert routing, staging verification, rollback rehearsal).
 */
export function evaluateReadiness(
  evidence: ReadinessEvidence,
  currentTime: string
): ReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check if evidence is stale (older than 2 hours)
  const evidenceAge = timeDiffSeconds(evidence.generatedAt, currentTime);
  const staleThreshold = 2 * 60 * 60; // 2 hours
  if (evidenceAge > staleThreshold) {
    warnings.push(
      `Evidence is stale (${formatSeconds(evidenceAge)} old). ` +
        `Re-collect evidence for most recent state.`
    );
  }

  // Check rollout percent (pre-canary must be 0, not already running)
  if (evidence.rolloutPercent > 10) {
    blockers.push(
      `Rollout already in progress (${evidence.rolloutPercent}%). ` +
        `This pre-canary readiness check is only valid when rollout is at 0%.`
    );
  } else if (evidence.rolloutPercent === 10) {
    warnings.push(
      `Rollout at 10% canary. This pre-canary readiness check may be stale. ` +
        `Use ongoing phase monitoring instead.`
    );
  }

  // Check API health
  if (!evidence.apiHealth) {
    blockers.push(
      "API health data missing. Cannot evaluate feed status."
    );
  } else if (evidence.apiHealth.totalFeeds === 0) {
    blockers.push(
      "No feeds in health summary. Cannot determine feed health."
    );
  } else if (!evidence.apiHealth.systemHealthy) {
    blockers.push(
      `API health: unhealthy feeds detected (${evidence.apiHealth.unhealthyFeeds.join(", ")}). ` +
        `Cannot proceed with rollout until required feeds healthy.`
    );
  }

  // Check validation gates
  if (!evidence.validation) {
    blockers.push("Validation data missing. Cannot evaluate gate status.");
  } else if (evidence.validation.gates.length === 0) {
    blockers.push(
      "No validation gates found. Cannot evaluate validation status."
    );
  } else if (!evidence.validation.allValidationsPassed) {
    const failedGates = evidence.validation.gates
      .filter((g) => g.status !== "passed")
      .map((g) => `${g.gate}:${g.status}`)
      .join(", ");
    blockers.push(
      `Validation gates: not all gates have passed (${failedGates}). ` +
        `Cannot proceed until all validation gates pass.`
    );
  }

  // Check pre-deploy gates signed off
  if (!evidence.gates) {
    blockers.push(
      "Pre-deploy gate status missing. Cannot evaluate sign-off status."
    );
  } else if (evidence.gates.totalCount === 0) {
    blockers.push(
      "No pre-deploy gates found. Cannot evaluate sign-off status."
    );
  } else if (!evidence.gates.allSigned) {
    blockers.push(
      `Gates signed off: ${evidence.gates.passedCount}/${evidence.gates.totalCount} signed. ` +
        `Cannot proceed until all pre-deploy gates are signed off.`
    );
  }

  // Determine status
  let status: "ready" | "warning" | "blocked";
  if (blockers.length > 0) {
    status = "blocked";
  } else if (warnings.length > 0) {
    status = "warning";
  } else {
    status = "ready";
  }

  // Manual checks (always present, code cannot verify these automatically)
  const manualChecks: ManualCheck[] = [
    {
      title: "Grafana Dashboard Imported",
      description:
        "Import docs/grafana-api-health-dashboard.json into Grafana " +
        "and verify all panels display data correctly.",
      status: "pending"
    },
    {
      title: "Alert Routing Configured",
      description:
        "Configure Grafana alert routing per docs/grafana-api-health-alerts.md " +
        "(Slack, PagerDuty, etc.) and verify delivery.",
      status: "pending"
    },
    {
      title: "Staging Telemetry Verified",
      description:
        "Run manual collection in staging environment, confirm " +
        "metrics flowing to api_health_metrics table, " +
        "and verify /api/admin/api-health returns expected data.",
      status: "pending"
    },
    {
      title: "Rollback Rehearsal Complete",
      description:
        "Test rollback procedure: set ENERGY_ROLLOUT_PERCENT=0 in staging, " +
        "verify snapshot serving resumes, confirm no data loss.",
      status: "pending"
    },
    {
      title: "Team Communication",
      description:
        "Notify team of rollout schedule, phases, success criteria, " +
        "and incident response procedures.",
      status: "pending"
    }
  ];

  return {
    status,
    blockers,
    warnings,
    manualChecks,
    evidence,
    generatedAt: currentTime
  };
}

/**
 * Calculate time difference in seconds between two ISO 8601 timestamps.
 */
function timeDiffSeconds(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, Math.round((to - from) / 1000));
}

/**
 * Format seconds as human-readable duration string.
 */
function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
