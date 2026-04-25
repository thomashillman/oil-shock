import { describe, expect, it } from "vitest";
import {
  formatEvidenceReport,
  type HealthPayload,
  type RolloutReadinessResponse,
  type RolloutStatusResponse,
  type PerFeedHealth,
  type ApiHealthResponse,
  type EndpointEvidence
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

      const healthEvidence: EndpointEvidence<HealthPayload> = {
        endpoint: "/health",
        ok: true,
        status: 200,
        data: health
      };

      const readinessEvidence: EndpointEvidence<RolloutReadinessResponse> = {
        endpoint: "/api/admin/rollout-readiness",
        ok: true,
        status: 200,
        data: readiness
      };

      const statusEvidence: EndpointEvidence<RolloutStatusResponse> = {
        endpoint: "/api/admin/rollout-status",
        ok: true,
        status: 200,
        data: rolloutStatus
      };

      const apiHealthEvidence: EndpointEvidence<ApiHealthResponse> = {
        endpoint: "/api/admin/api-health",
        ok: true,
        status: 200,
        data: apiHealth
      };

      const report = formatEvidenceReport(healthEvidence, readinessEvidence, statusEvidence, apiHealthEvidence, mockGeneratedAt);

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

      const healthEvidence: EndpointEvidence<HealthPayload> = {
        endpoint: "/health",
        ok: true,
        status: 200,
        data: health
      };

      const readinessEvidence: EndpointEvidence<RolloutReadinessResponse> = {
        endpoint: "/api/admin/rollout-readiness",
        ok: true,
        status: 200,
        data: readiness
      };

      const statusEvidence: EndpointEvidence<RolloutStatusResponse> = {
        endpoint: "/api/admin/rollout-status",
        ok: true,
        status: 200,
        data: rolloutStatus
      };

      const apiHealthEvidence: EndpointEvidence<ApiHealthResponse> = {
        endpoint: "/api/admin/api-health",
        ok: true,
        status: 200,
        data: apiHealth
      };

      const report = formatEvidenceReport(healthEvidence, readinessEvidence, statusEvidence, apiHealthEvidence, mockGeneratedAt);

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

      const apiHealthEvidence: EndpointEvidence<ApiHealthResponse> = {
        endpoint: "/api/admin/api-health",
        ok: true,
        status: 200,
        data: apiHealth
      };

      const report = formatEvidenceReport(null, null, null, apiHealthEvidence, mockGeneratedAt);

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

      const healthEvidence: EndpointEvidence<HealthPayload> = {
        endpoint: "/health",
        ok: true,
        status: 200,
        data: health
      };

      const readinessEvidence: EndpointEvidence<RolloutReadinessResponse> = {
        endpoint: "/api/admin/rollout-readiness",
        ok: true,
        status: 200,
        data: readiness
      };

      const statusEvidence: EndpointEvidence<RolloutStatusResponse> = {
        endpoint: "/api/admin/rollout-status",
        ok: true,
        status: 200,
        data: rolloutStatus
      };

      const apiHealthEvidence: EndpointEvidence<ApiHealthResponse> = {
        endpoint: "/api/admin/api-health",
        ok: true,
        status: 200,
        data: apiHealth
      };

      const report = formatEvidenceReport(healthEvidence, readinessEvidence, statusEvidence, apiHealthEvidence, mockGeneratedAt);

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

      const readinessEvidence: EndpointEvidence<RolloutReadinessResponse> = {
        endpoint: "/api/admin/rollout-readiness",
        ok: true,
        status: 200,
        data: readiness
      };

      const report = formatEvidenceReport(null, readinessEvidence, null, null, mockGeneratedAt);

      expect(report).toContain("WARNING");
      expect(report).toContain("explicit sign-off");
      expect(report).toContain("Some data is stale");
    });
  });

  describe("HTTP status code preservation", () => {
    it("shows HTTP 503 status with JSON body preserved in report", () => {
      // Endpoint returns 503 but has valid JSON body with data
      const apiHealth: ApiHealthResponse = {
        generatedAt: mockGeneratedAt,
        systemHealthy: true,
        unhealthyFeeds: [],
        feeds: [
          {
            feedName: "eia_wti",
            provider: "EIA",
            displayName: "EIA WTI Spot",
            status: "OK",
            latencyP95Ms: 250,
            errorRatePct: 0,
            lastSuccessfulAt: "2026-04-25T11:55:00Z",
            lastAttemptedAt: "2026-04-25T11:56:00Z",
            attemptCount1h: 60,
            successCount1h: 60,
            failureCount1h: 0,
            timeoutCount1h: 0
          }
        ],
        summary: { totalFeeds: 1, healthyFeeds: 1, degradedFeeds: 0, downFeeds: 0 }
      };

      const apiHealthEvidence: EndpointEvidence<ApiHealthResponse> = {
        endpoint: "/api/admin/api-health",
        ok: false,
        status: 503,
        data: apiHealth,
        error: "HTTP 503"
      };

      const report = formatEvidenceReport(null, null, null, apiHealthEvidence, mockGeneratedAt);

      // Report should show that /api/admin/api-health failed with HTTP 503
      expect(report).toContain("INCOMPLETE");
      expect(report).toContain("HTTP 503");
      expect(report).toContain("/api/admin/api-health");

      // BUT the JSON body should still be rendered since data was preserved
      expect(report).toContain("EIA WTI Spot");
      expect(report).toContain("eia_wti");
      expect(report).toContain("250ms");
    });

    it("shows network errors marked incomplete", () => {
      const healthEvidence: EndpointEvidence<HealthPayload> = {
        endpoint: "/health",
        ok: false,
        status: 0,
        data: null,
        error: "Network error: ECONNREFUSED"
      };

      const report = formatEvidenceReport(healthEvidence, null, null, null, mockGeneratedAt);

      expect(report).toContain("INCOMPLETE");
      expect(report).toContain("Network error");
      expect(report).toContain("/health");
    });

    it("shows all four endpoint statuses in incomplete section", () => {
      const healthEvidence: EndpointEvidence<HealthPayload> = {
        endpoint: "/health",
        ok: false,
        status: 500,
        data: null,
        error: "HTTP 500"
      };

      const readinessEvidence: EndpointEvidence<RolloutReadinessResponse> = {
        endpoint: "/api/admin/rollout-readiness",
        ok: false,
        status: 502,
        data: null,
        error: "HTTP 502"
      };

      const statusEvidence: EndpointEvidence<RolloutStatusResponse> = {
        endpoint: "/api/admin/rollout-status",
        ok: true,
        status: 200,
        data: { feature: "ENERGY_ROLLOUT_PERCENT", rolloutPercent: 0, phase: "pre-rollout", description: "test", timestamp: "2026-04-25T12:00:00Z" }
      };

      const apiHealthEvidence: EndpointEvidence<ApiHealthResponse> = {
        endpoint: "/api/admin/api-health",
        ok: false,
        status: 0,
        data: null,
        error: "Network error: timeout"
      };

      const report = formatEvidenceReport(healthEvidence, readinessEvidence, statusEvidence, apiHealthEvidence, mockGeneratedAt);

      expect(report).toContain("INCOMPLETE");
      expect(report).toContain("HTTP 500");
      expect(report).toContain("HTTP 502");
      expect(report).toContain("Network error");
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

      const healthEvidence: EndpointEvidence<HealthPayload> = {
        endpoint: "/health",
        ok: true,
        status: 200,
        data: health
      };

      const report = formatEvidenceReport(healthEvidence, null, null, null, mockGeneratedAt);

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

      const readinessEvidence: EndpointEvidence<RolloutReadinessResponse> = {
        endpoint: "/api/admin/rollout-readiness",
        ok: true,
        status: 200,
        data: readiness
      };

      const report1 = formatEvidenceReport(null, readinessEvidence, null, null, mockGeneratedAt);
      const report2 = formatEvidenceReport(null, readinessEvidence, null, null, mockGeneratedAt);

      expect(report1).toBe(report2);
    });
  });
});
