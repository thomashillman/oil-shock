/**
 * Phase 6A Canary Evidence Report Formatter
 *
 * Pure formatter that converts mocked endpoint responses into a Markdown evidence report.
 * This is not a network client; it only formats data passed to it.
 *
 * Supported status values:
 * - "ready": All automatic checks pass, ready for 10% canary with manual sign-off
 * - "warning": Some concerns but likely acceptable with explicit sign-off
 * - "blocked": Critical blocker, do not proceed
 */

export interface HealthPayload {
  ok: boolean;
  status?: "healthy" | "degraded" | "unavailable";
  service: string;
  env: string;
  runtimeMode?: "oilshock" | "macro-signals";
  degradedComponents?: string[];
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
  timestamp?: string;
}

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

export interface GateStatus {
  gate: string;
  status: "passed" | "pending" | "failed";
}

export interface ValidationGates {
  allValidationsPassed: boolean;
  readyForRollout: boolean;
  gates: GateStatus[];
}

export interface ApiHealthEvidence {
  systemHealthy: boolean;
  unhealthyFeeds: string[];
  totalFeeds: number;
  healthyFeeds: number;
}

export interface GatesEvidence {
  passedCount: number;
  totalCount: number;
  allSigned: boolean;
}

export interface ReadinessEvidenceData {
  generatedAt: string;
  rolloutPercent: number;
  apiHealth: ApiHealthEvidence;
  validation: ValidationGates;
  gates: GatesEvidence;
}

export interface ManualCheck {
  title: string;
  description: string;
  status: "pending" | "completed";
}

export interface RolloutReadinessResponse {
  status: "ready" | "warning" | "blocked";
  blockers: string[];
  warnings: string[];
  manualChecks: ManualCheck[];
  evidence: ReadinessEvidenceData;
}

export interface RolloutStatusResponse {
  feature: string;
  rolloutPercent: number;
  phase: string;
  description: string;
  timestamp: string;
}

/**
 * Endpoint evidence envelope type (imported from capture-canary-evidence)
 * Preserves HTTP status and error metadata for report generation
 */
export interface EndpointEvidence<T> {
  endpoint: string;
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Format evidence into a Markdown report for operators.
 *
 * This function is deterministic: identical inputs produce identical output.
 * Null/missing endpoint data is marked conservative and incomplete.
 * HTTP status codes are preserved and displayed in the report.
 */
export function formatEvidenceReport(
  health: EndpointEvidence<HealthPayload | null> | null,
  readiness: EndpointEvidence<RolloutReadinessResponse | null> | null,
  rolloutStatus: EndpointEvidence<RolloutStatusResponse | null> | null,
  apiHealth: EndpointEvidence<ApiHealthResponse | null> | null,
  generatedAt: string
): string {
  const lines: string[] = [];

  // Header
  lines.push("# Phase 6A Canary Evidence Report");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");

  // Check if evidence collection is complete
  const isComplete = health?.ok && readiness?.ok && rolloutStatus?.ok && apiHealth?.ok;

  if (!isComplete) {
    lines.push("⚠️ **INCOMPLETE EVIDENCE COLLECTION**");
    lines.push("");
    lines.push("Some endpoints failed to respond. Report is conservative and incomplete.");
    lines.push("");

    if (!health?.ok) {
      const statusStr = health?.status ? ` (HTTP ${health.status})` : "";
      const errorStr = health?.error ? ` - ${health.error}` : "";
      lines.push(`- ❌ \`/health\` failed${statusStr}${errorStr}`);
    }
    if (!readiness?.ok) {
      const statusStr = readiness?.status ? ` (HTTP ${readiness.status})` : "";
      const errorStr = readiness?.error ? ` - ${readiness.error}` : "";
      lines.push(`- ❌ \`/api/admin/rollout-readiness\` failed${statusStr}${errorStr}`);
    }
    if (!rolloutStatus?.ok) {
      const statusStr = rolloutStatus?.status ? ` (HTTP ${rolloutStatus.status})` : "";
      const errorStr = rolloutStatus?.error ? ` - ${rolloutStatus.error}` : "";
      lines.push(`- ❌ \`/api/admin/rollout-status\` failed${statusStr}${errorStr}`);
    }
    if (!apiHealth?.ok) {
      const statusStr = apiHealth?.status ? ` (HTTP ${apiHealth.status})` : "";
      const errorStr = apiHealth?.error ? ` - ${apiHealth.error}` : "";
      lines.push(`- ❌ \`/api/admin/api-health\` failed${statusStr}${errorStr}`);
    }
    lines.push("");
  }

  // Main status section
  if (readiness?.data) {
    lines.push("## Readiness Assessment");
    lines.push("");

    const statusEmoji =
      readiness.data.status === "ready"
        ? "✅"
        : readiness.data.status === "warning"
          ? "⚠️"
          : "❌";
    lines.push(`Status: **${statusEmoji} ${readiness.data.status.toUpperCase()}**`);
    lines.push("");

    if (readiness.data.status === "ready") {
      lines.push(
        "✅ **Ready for 10% canary, subject to manual sign-off**"
      );
      lines.push("");
      lines.push(
        "All automatic checks pass. Proceed only if:"
      );
      lines.push("1. All manual checks (below) are signed off");
      lines.push("2. Team is notified and synchronized");
      lines.push("3. You have verified rollback procedures work");
      lines.push("");
      lines.push(
        "⚠️ This report does not deploy anything. Setting `ENERGY_ROLLOUT_PERCENT=10` is a separate manual step."
      );
      lines.push("⚠️ This report does not change rollout percentage.");
      lines.push("⚠️ This report does not sign any gates.");
      lines.push("");
    } else if (readiness.data.status === "warning") {
      lines.push(
        "⚠️ **Proceed only with explicit sign-off**"
      );
      lines.push("");
      lines.push(
        "Some concerns exist but may be acceptable. Team lead must explicitly approve in writing before proceeding."
      );
      lines.push("");
    } else if (readiness.data.status === "blocked") {
      lines.push(
        "❌ **DO NOT PROCEED TO 10% CANARY**"
      );
      lines.push("");
      lines.push(
        "Critical blockers must be resolved before rollout can proceed."
      );
      lines.push("");
    }

    // Blockers
    if (readiness.data.blockers.length > 0) {
      lines.push("### Blockers");
      lines.push("");
      for (const blocker of readiness.data.blockers) {
        lines.push(`- ❌ ${blocker}`);
      }
      lines.push("");
    }

    // Warnings
    if (readiness.data.warnings.length > 0) {
      lines.push("### Warnings");
      lines.push("");
      for (const warning of readiness.data.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push("");
    }
  }

  // Evidence section
  if (readiness?.data?.evidence) {
    const evidence = readiness.data.evidence;

    lines.push("## Automatic Checks (Code-Verified)");
    lines.push("");

    // Pre-deploy gates
    lines.push("### Pre-Deploy Gates");
    lines.push("");
    const gatesReady = evidence.gates.allSigned;
    lines.push(
      `${gatesReady ? "✅" : "❌"} Gates: ${evidence.gates.passedCount}/${evidence.gates.totalCount} signed off`
    );
    lines.push("");

    // API health
    lines.push("### API Health (Phase 6A Required Feeds)");
    lines.push("");
    const apiHealthReady = evidence.apiHealth.systemHealthy;
    lines.push(
      `${apiHealthReady ? "✅" : "❌"} System healthy: ${evidence.apiHealth.healthyFeeds}/${evidence.apiHealth.totalFeeds} feeds OK`
    );
    if (evidence.apiHealth.unhealthyFeeds.length > 0) {
      lines.push(`   Unhealthy feeds: ${evidence.apiHealth.unhealthyFeeds.join(", ")}`);
    }
    lines.push("");

    // Validation
    lines.push("### Validation Gates");
    lines.push("");
    const validationReady = evidence.validation.allValidationsPassed;
    lines.push(
      `${validationReady ? "✅" : "❌"} All validations passed: ${validationReady ? "yes" : "no"}`
    );
    if (evidence.validation.gates.length > 0) {
      for (const gate of evidence.validation.gates) {
        const icon = gate.status === "passed" ? "✅" : gate.status === "pending" ? "⏳" : "❌";
        lines.push(`   ${icon} ${gate.gate}: ${gate.status}`);
      }
    }
    lines.push("");

    // Rollout percentage
    lines.push("### Rollout Status");
    lines.push("");
    lines.push("- Feature: ENERGY_ROLLOUT_PERCENT");
    lines.push(`- Current percent: ${evidence.rolloutPercent}%`);
    lines.push("- Target for canary: 10%");
    if (evidence.rolloutPercent !== 0) {
      lines.push(
        "   ⚠️ Non-zero rollout detected. Verify this is intentional."
      );
    }
    lines.push("");
  }

  // Feed health details
  if (apiHealth?.data?.feeds && apiHealth.data.feeds.length > 0) {
    lines.push("## Feed Health Details");
    lines.push("");
    for (const feed of apiHealth.data.feeds) {
      const icon = feed.status === "OK" ? "✅" : "❌";
      lines.push(
        `${icon} **${feed.displayName}** (${feed.feedName}): ${feed.status}`
      );
      lines.push(`   - Error rate: ${feed.errorRatePct}%`);
      if (feed.latencyP95Ms !== null) {
        lines.push(`   - Latency P95: ${feed.latencyP95Ms}ms`);
      }
      if (feed.lastSuccessfulAt) {
        lines.push(`   - Last success: ${feed.lastSuccessfulAt}`);
      }
    }
    lines.push("");
  }

  // Health endpoint data
  if (health?.data) {
    lines.push("## Service Health");
    lines.push("");
    lines.push(`- Service: ${health.data.service}`);
    lines.push(`- Environment: ${health.data.env}`);
    lines.push(`- Runtime mode: ${health.data.runtimeMode ?? "unknown"}`);
    lines.push(
      `- Status: ${health.data.status ?? "unknown"} ${health.data.ok ? "✅" : "❌"}`
    );
    if (health.data.degradedComponents?.length) {
      lines.push(`- Degraded components: ${health.data.degradedComponents.join(", ")}`);
    }
    if (health.data.dependencies?.database) {
      lines.push(
        `- Database: ${health.data.dependencies.database.status} (${health.data.dependencies.database.latency_ms ?? "?"}ms)`
      );
    }
    if (health.data.dependencies?.config) {
      lines.push(
        `- Config: ${health.data.dependencies.config.status} (${health.data.dependencies.config.threshold_count ?? 0} thresholds)`
      );
    }
    lines.push("");
  }

  // Manual checks
  if (readiness?.data?.manualChecks && readiness.data.manualChecks.length > 0) {
    lines.push("## Manual Verification Checklist");
    lines.push("");
    lines.push("These items require operator sign-off and cannot be automated:");
    lines.push("");
    for (const check of readiness.data.manualChecks) {
      const icon = check.status === "completed" ? "✅" : "⏳";
      lines.push(`${icon} **${check.title}**`);
      lines.push(`   ${check.description}`);
    }
    lines.push("");
  }

  // Disclaimer and next steps
  lines.push("## Important Reminders");
  lines.push("");
  lines.push("- ✅ This report does not deploy anything");
  lines.push("- ✅ This report does not change `ENERGY_ROLLOUT_PERCENT`");
  lines.push("- ✅ This report does not sign any gates");
  lines.push("- ✅ Manual checks remain manual");
  lines.push("- ✅ This is a read-only evidence collection tool");
  lines.push("");
  lines.push("## Next Steps (if ready)");
  lines.push("");
  lines.push(
    "1. Save this report as an ops record (e.g., `docs/evidence/phase6a-canary-readiness-2026-04-25.md`)"
  );
  lines.push("2. Ensure all manual checks are signed off by respective owners");
  lines.push(
    "3. Deploy code change: set `ENERGY_ROLLOUT_PERCENT=10` in worker configuration"
  );
  lines.push("4. Verify `/api/admin/rollout-status` returns `phase=\"canary-internal\"`");
  lines.push(
    "5. Follow daily monitoring checklist from `docs/rollout-monitoring-strategy.md`"
  );
  lines.push("");
  lines.push("## References");
  lines.push("");
  lines.push(
    "- Readiness checklist: `docs/phase-6a-rollout-readiness.md`"
  );
  lines.push(
    "- Monitoring strategy: `docs/rollout-monitoring-strategy.md`"
  );
  lines.push(
    "- Rollback procedure: `docs/phase-6-rollback-procedures.md`"
  );
  lines.push("");

  return lines.join("\n");
}
