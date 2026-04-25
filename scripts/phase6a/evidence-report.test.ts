import { describe, expect, it } from "vitest";
import {
  formatEvidenceReport,
  type HealthPayload,
  type RolloutReadinessResponse,
  type RolloutStatusResponse,
  type ApiHealthResponse
} from "./evidence-report";

describe("Evidence Report Formatter", () => {
  const mockGeneratedAt = "2026-04-25T12:00:00.000Z";

  describe("ready scenario", () => {
    it("produces clear ready-for-canary section when all checks pass", () => {
      const health: HealthPayload = {
        ok: true,
        status: "healthy",
        service: "oil-shock-worker",
        env: "staging",
        runtimeMode: "macro-signals",
        degradedComponents: undefined,
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
          { item: "Telemetry Setup", complete: true },
          { item: "Grafana Monitoring", complete: true },
          { item: "Team Communication", complete: true },
          { item: "Rollback Rehearsal", complete: true }
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
              { gate: "data_freshness", status: "passed" },
              { gate: "rule_consistency", status: "passed" },
              { gate: "guardrail_correctness", status: "passed" }
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
        feeds: [
          {
            feed_name: "eia_wti",
            provider: "EIA",
            status: "OK",
            error_rate_pct: 0,
            last_success: "2026-04-25T11:58:00.000Z"
          },
          {
            feed_name: "eia_brent",
            provider: "EIA",
            status: "OK",
            error_rate_pct: 0.1,
            last_success: "2026-04-25T11:58:00.000Z"
          },
          {
            feed_name: "eia_diesel_wti_crack",
            provider: "EIA",
            status: "OK",
            error_rate_pct: 0,
            last_success: "2026-04-25T11:57:30.000Z"
          }
        ]
      };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("Ready for 10% canary");
      expect(report).toContain("does not change rollout percentage");
      expect(report).toContain("does not deploy");
      expect(report).toContain("ready");
      expect(report).not.toContain("DO NOT PROCEED");
    });

    it("includes endpoint timestamps in report", () => {
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

      const apiHealth: ApiHealthResponse = { feeds: [] };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("2026-04-25");
      expect(report).toContain("Generated at:");
    });
  });

  describe("blocked scenario", () => {
    it("produces clear do-not-proceed section when readiness is blocked", () => {
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

      const apiHealth: ApiHealthResponse = { feeds: [] };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("BLOCKED");
      expect(report).toContain("DO NOT PROCEED");
      expect(report).toContain("Database connection failed");
      expect(report).not.toContain("Ready for 10%");
    });

    it("includes all blockers in report", () => {
      const health: HealthPayload = {
        ok: false,
        status: "unavailable",
        service: "oil-shock-worker",
        env: "staging",
        runtimeMode: "oilshock",
        degradedComponents: ["database", "config"],
        featureFlags: { macroSignals: false },
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const readiness: RolloutReadinessResponse = {
        status: "blocked",
        blockers: ["Gate ENABLE_MACRO_SIGNALS not signed off", "Feed eia_wti unhealthy"],
        warnings: [],
        manualChecks: [],
        evidence: {
          generatedAt: mockGeneratedAt,
          rolloutPercent: 0,
          apiHealth: { systemHealthy: false, unhealthyFeeds: ["eia_wti"], totalFeeds: 3, healthyFeeds: 2 },
          validation: { allValidationsPassed: false, readyForRollout: false, gates: [] },
          gates: { passedCount: 4, totalCount: 6, allSigned: false }
        }
      };

      const rolloutStatus: RolloutStatusResponse = {
        feature: "ENERGY_ROLLOUT_PERCENT",
        rolloutPercent: 0,
        phase: "pre-rollout",
        description: "Energy engine not deployed",
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const apiHealth: ApiHealthResponse = { feeds: [] };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("Gate ENABLE_MACRO_SIGNALS not signed off");
      expect(report).toContain("Feed eia_wti unhealthy");
    });
  });

  describe("warning scenario", () => {
    it("produces explicit sign-off required section for warning status", () => {
      const health: HealthPayload = {
        ok: true,
        status: "healthy",
        service: "oil-shock-worker",
        env: "staging",
        runtimeMode: "macro-signals",
        featureFlags: { macroSignals: true },
        timestamp: "2026-04-25T11:59:00.000Z",
        dependencies: {
          database: { status: "healthy", latency_ms: 45 },
          config: { status: "healthy", threshold_count: 5 }
        }
      };

      const readiness: RolloutReadinessResponse = {
        status: "warning",
        blockers: [],
        warnings: ["Some data is stale but within acceptable threshold"],
        manualChecks: [{ item: "Grafana Monitoring", complete: false }],
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
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const apiHealth: ApiHealthResponse = { feeds: [] };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("WARNING");
      expect(report).toContain("explicit sign-off");
      expect(report).toContain("Some concerns exist");
    });
  });

  describe("missing endpoint data", () => {
    it("marks evidence incomplete when endpoint data is null", () => {
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

      // Missing readiness, status, and health endpoints
      const report = formatEvidenceReport(health, null, null, null, mockGeneratedAt);

      expect(report).toContain("INCOMPLETE");
      expect(report).toContain("Service Health"); // Should mention the working endpoint
      expect(report).toContain("macro-signals"); // Should include data from the working endpoint
    });
  });

  describe("manual checks preservation", () => {
    it("includes all manual checks in report", () => {
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
        manualChecks: [
          { item: "Telemetry Setup", complete: true },
          { item: "Grafana Monitoring", complete: true },
          { item: "Team Communication", complete: false },
          { item: "Rollback Rehearsal", complete: true }
        ],
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
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const apiHealth: ApiHealthResponse = { feeds: [] };

      const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report).toContain("Telemetry Setup");
      expect(report).toContain("Grafana Monitoring");
      expect(report).toContain("Team Communication");
      expect(report).toContain("Rollback Rehearsal");
    });
  });

  describe("determinism", () => {
    it("produces identical output for identical input", () => {
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
        timestamp: "2026-04-25T11:59:00.000Z"
      };

      const apiHealth: ApiHealthResponse = { feeds: [] };

      const report1 = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);
      const report2 = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, mockGeneratedAt);

      expect(report1).toBe(report2);
    });
  });
});
