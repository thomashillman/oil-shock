import { describe, expect, it } from "vitest";
import {
  formatEvidenceReport,
  type HealthPayload,
  type RolloutReadinessResponse,
  type RolloutStatusResponse,
  type PerFeedHealth,
  type ApiHealthResponse
} from "../../../scripts/phase6a/evidence-report";

describe("Evidence Report Formatter", () => {
  const mockGeneratedAt = "2026-04-25T12:00:00.000Z";

  describe("ready scenario with real payload shapes", () => {
    it("produces clear ready-for-canary section with real manualChecks shape", () => {
      const health: HealthPayload = {
        ok: true,
        status: "healthy",
        service: "oil-shock-worker",
        env: "staging",
        runtimeMode: "macro-signals",
        featureFlags: { macroSignals: true },
        timestamp: "2026-04-25T11:59:00.000Z",
        dependencies: {
          database: { status: "healthy", latency_ms: 42 },
          config: { status: "healthy", threshold_count: 5 }
        }
      };

      const readiness: RolloutReadinessResponse = {
        status: "ready",
        blockers: [],
        warnings: [],
        manualChecks: [
          {
            title: "Grafana Dashboard Imported",
            description: "Import docs/grafana-api-health-dashboard.json into Grafana and verify all panels display data.",
            status: "pending"
          },
          {
            title: "Alert Routing Configured",
            description: "Configure Grafana alert routing and verify delivery.",
            status: "pending"
          }
        ],
        evidence: {
          generatedAt: mockGeneratedAt,
          rolloutPercent: 0,
          apiHealth: {
            systemHealthy: true,
            unhealthyFeeds: [],
            totalFeeds: 3,
            healthyFeeds: 3
          },
          validation: {
            allValidationsPassed: true,
            readyForRollout: true,
            gates: [
              { gate: "determinism", status: "passed" },
              { gate: "data_freshness", status: "passed" }
            ]
          },
          gates: {
            passedCount: 6,
            totalCount: 6,
            allSigned: true
          }
        }
      };

      const rolloutStatus: RolloutStatusResponse = {
        feature: "ENERGY_ROLLOUT_PERCENT",
        rolloutPercent: 0,
        phase: "pre-rollout",
        description: "Energy engine not deployed",
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const apiHealth: ApiHealthResponse = {
        generatedAt: mockGeneratedAt,
        systemHealthy: true,
        unhealthyFeeds: [],
        feeds: [],
        summary: { totalFeeds: 0, healthyFeeds: 0, degradedFeeds: 0, downFeeds: 0 }
      };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("Ready for 10% canary");
      expect(report).toContain("does not change rollout percentage");
      expect(report).toContain("does not deploy");
      expect(report).toContain("ready");
      expect(report).toContain("Grafana Dashboard Imported");
      expect(report).not.toContain("DO NOT PROCEED");
    });

    it("includes timestamps in report", () => {
      const health: HealthPayload = {
        ok: true,
        status: "healthy",
        service: "oil-shock-worker",
        env: "staging",
        runtimeMode: "macro-signals",
        featureFlags: { macroSignals: true },
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const readiness: RolloutReadinessResponse = {
        status: "ready",
        blockers: [],
        warnings: [],
        manualChecks: [],
        evidence: {
          generatedAt: mockGeneratedAt,
          rolloutPercent: 0,
          apiHealth: { systemHealthy: true, unhealthyFeeds: [], totalFeeds: 3, healthyFeeds: 3 },
          validation: { allValidationsPassed: true, readyForRollout: true, gates: [] },
          gates: { passedCount: 6, totalCount: 6, allSigned: true }
        }
      };

      const rolloutStatus: RolloutStatusResponse = {
        feature: "ENERGY_ROLLOUT_PERCENT",
        rolloutPercent: 0,
        phase: "pre-rollout",
        description: "Energy engine not deployed",
        timestamp: "2026-04-25T11:59:05.000Z"
      };

      const apiHealth: ApiHealthResponse = {
        generatedAt: mockGeneratedAt,
        systemHealthy: true,
        unhealthyFeeds: [],
        feeds: [],
        summary: { totalFeeds: 0, healthyFeeds: 0, degradedFeeds: 0, downFeeds: 0 }
      };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("2026-04-25");
      expect(report).toContain("Generated at:");
    });
  });

  describe("real API health payload", () => {
    it("renders PerFeedHealth with camelCase fields correctly", () => {
      const feed: PerFeedHealth = {
        feedName: "eia_wti",
        provider: "EIA",
        displayName: "EIA WTI Spot",
        status: "OK",
        latencyP95Ms: 250,
        errorRatePct: 0.5,
        lastSuccessfulAt: "2026-04-25T11:55:00Z",
        lastAttemptedAt: "2026-04-25T11:56:00Z",
        attemptCount1h: 60,
        successCount1h: 59,
        failureCount1h: 1,
        timeoutCount1h: 0
      };

      const apiHealth: ApiHealthResponse = {
        generatedAt: mockGeneratedAt,
        systemHealthy: true,
        unhealthyFeeds: [],
        feeds: [feed],
        summary: {
          totalFeeds: 1,
          healthyFeeds: 1,
          degradedFeeds: 0,
          downFeeds: 0
        }
      };

      const report = formatEvidenceReport(null, null, null, apiHealth, mockGeneratedAt);

      expect(report).toContain("EIA WTI Spot");
      expect(report).toContain("eia_wti");
      expect(report).toContain("0.5%");
      expect(report).toContain("250ms");
      expect(report).toContain("2026-04-25T11:55:00Z");
    });
  });

  describe("blocked scenario", () => {
    it("produces clear DO-NOT-PROCEED section when blocked", () => {
      const health: HealthPayload = {
        ok: false,
        status: "degraded",
        service: "oil-shock-worker",
        env: "staging",
        runtimeMode: "macro-signals",
        degradedComponents: ["database"],
        featureFlags: { macroSignals: true },
        timestamp: "2026-04-25T11:59:00.000Z",
        dependencies: {
          database: { status: "unhealthy", latency_ms: 0 },
          config: { status: "healthy", threshold_count: 5 }
        }
      };

      const readiness: RolloutReadinessResponse = {
        status: "blocked",
        blockers: ["Database connection failed"],
        warnings: [],
        manualChecks: [],
        evidence: {
          generatedAt: mockGeneratedAt,
          rolloutPercent: 0,
          apiHealth: { systemHealthy: false, unhealthyFeeds: ["eia_wti"], totalFeeds: 3, healthyFeeds: 2 },
          validation: { allValidationsPassed: false, readyForRollout: true, gates: [] },
          gates: { passedCount: 5, totalCount: 6, allSigned: false }
        }
      };

      const rolloutStatus: RolloutStatusResponse = {
        feature: "ENERGY_ROLLOUT_PERCENT",
        rolloutPercent: 0,
        phase: "pre-rollout",
        description: "Energy engine not deployed",
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const apiHealth: ApiHealthResponse = {
        generatedAt: mockGeneratedAt,
        systemHealthy: false,
        unhealthyFeeds: ["eia_wti"],
        feeds: [],
        summary: { totalFeeds: 0, healthyFeeds: 0, degradedFeeds: 0, downFeeds: 0 }
      };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("BLOCKED");
      expect(report).toContain("DO NOT PROCEED");
      expect(report).toContain("Database connection failed");
      expect(report).not.toContain("Ready for 10%");
    });
  });

  describe("warning scenario", () => {
    it("produces explicit sign-off section for WARNING status", () => {
      const readiness: RolloutReadinessResponse = {
        status: "warning",
        blockers: [],
        warnings: ["Some data is stale but within acceptable threshold"],
        manualChecks: [
          {
            title: "Grafana Dashboard Imported",
            description: "Import and verify panels.",
            status: "pending"
          }
        ],
        evidence: {
          generatedAt: mockGeneratedAt,
          rolloutPercent: 0,
          apiHealth: { systemHealthy: true, unhealthyFeeds: [], totalFeeds: 3, healthyFeeds: 3 },
          validation: { allValidationsPassed: true, readyForRollout: true, gates: [] },
          gates: { passedCount: 6, totalCount: 6, allSigned: true }
        }
      };

      const report = formatEvidenceReport(null, readiness, null, null, mockGeneratedAt);

      expect(report).toContain("WARNING");
      expect(report).toContain("explicit sign-off");
      expect(report).toContain("Some data is stale");
    });
  });

  describe("incomplete evidence", () => {
    it("marks evidence incomplete when all endpoints are null", () => {
      const report = formatEvidenceReport(null, null, null, null, mockGeneratedAt);

      expect(report).toContain("INCOMPLETE");
      expect(report).toContain("endpoints failed");
    });

    it("preserves partial endpoint data", () => {
      const health: HealthPayload = {
        ok: true,
        status: "healthy",
        service: "oil-shock-worker",
        env: "staging",
        runtimeMode: "macro-signals",
        featureFlags: { macroSignals: true },
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const report = formatEvidenceReport(health, null, null, null, mockGeneratedAt);

      expect(report).toContain("INCOMPLETE");
      expect(report).toContain("Service Health");
      expect(report).toContain("macro-signals");
    });
  });

  describe("determinism", () => {
    it("produces identical output for identical input", () => {
      const readiness: RolloutReadinessResponse = {
        status: "ready",
        blockers: [],
        warnings: [],
        manualChecks: [],
        evidence: {
          generatedAt: mockGeneratedAt,
          rolloutPercent: 0,
          apiHealth: { systemHealthy: true, unhealthyFeeds: [], totalFeeds: 3, healthyFeeds: 3 },
          validation: { allValidationsPassed: true, readyForRollout: true, gates: [] },
          gates: { passedCount: 6, totalCount: 6, allSigned: true }
        }
      };

      const report1 = formatEvidenceReport(null, readiness, null, null, mockGeneratedAt);
      const report2 = formatEvidenceReport(null, readiness, null, null, mockGeneratedAt);

      expect(report1).toBe(report2);
    });
  });
});
