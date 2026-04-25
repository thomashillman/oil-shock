import { describe, expect, it } from "vitest";
import {
  evaluateReadiness,
  type ReadinessResult,
  type ReadinessEvidence
} from "../../src/core/rollout/readiness";

describe("Phase 6A rollout readiness evaluator", () => {
  it("returns ready status when all conditions met", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
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
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);

    expect(result.status).toBe("ready");
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.evidence).toEqual(evidence);
  });

  it("returns blocked status when API health has unhealthy feeds", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent: 0,
      apiHealth: {
        systemHealthy: false,
        unhealthyFeeds: ["eia_wti", "eia_brent"],
        totalFeeds: 3,
        healthyFeeds: 1
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
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain(
      "API health: unhealthy feeds detected (eia_wti, eia_brent). Cannot proceed with rollout until all feeds healthy."
    );
  });

  it("returns blocked status when validation is not ready", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent: 0,
      apiHealth: {
        systemHealthy: true,
        unhealthyFeeds: [],
        totalFeeds: 3,
        healthyFeeds: 3
      },
      validation: {
        allValidationsPassed: false,
        readyForRollout: false,
        gates: [
          { gate: "determinism", status: "passed" },
          { gate: "data_freshness", status: "pending" }
        ]
      },
      gates: {
        passedCount: 2,
        totalCount: 4,
        allSigned: false
      }
    };

    const result = evaluateReadiness(evidence, now);

    expect(result.status).toBe("blocked");
    expect(result.blockers.some((b) =>
      b.includes("Validation gates: not all gates have passed")
    )).toBe(true);
  });

  it("returns blocked status when gates are missing or expired", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
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
        passedCount: 2,
        totalCount: 6,
        allSigned: false
      }
    };

    const result = evaluateReadiness(evidence, now);

    expect(result.status).toBe("blocked");
    expect(result.blockers.some((b) => b.includes("Gates signed off"))).toBe(
      true
    );
  });

  it("returns warning status when telemetry exists but is stale", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const staleTime = new Date(new Date(now).getTime() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours old
    const evidence: ReadinessEvidence = {
      generatedAt: staleTime,
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
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);

    expect(result.status).toBe("warning");
    expect(result.warnings.some((w) => w.includes("stale"))).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("includes manual checks in all statuses", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
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
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);

    expect(result.manualChecks).toBeDefined();
    expect(Array.isArray(result.manualChecks)).toBe(true);
    expect(result.manualChecks.length).toBeGreaterThan(0);

    // Manual checks should include items that code cannot automatically verify
    const checkDescriptions = result.manualChecks.map((c) => c.title).join(" ");
    expect(checkDescriptions).toMatch(/grafana|alert|staging|rollback/i);
  });

  it("produces deterministic output for identical input", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
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
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result1 = evaluateReadiness(evidence, now);
    const result2 = evaluateReadiness(evidence, now);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it("uses provided timestamp, does not generate its own", () => {
    const providedTime = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: providedTime,
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
        gates: [{ gate: "test", status: "passed" }]
      },
      gates: {
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, providedTime);

    expect(result.generatedAt).toBe(providedTime);
  });

  it("treats missing data as conservative (blocked or warning, never silently ready)", () => {
    const now = "2026-04-25T12:00:00.000Z";

    // Missing API health
    const evidenceMissingHealth: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent: 0,
      apiHealth: undefined as any,
      validation: {
        allValidationsPassed: true,
        readyForRollout: true,
        gates: [{ gate: "test", status: "passed" }]
      },
      gates: {
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidenceMissingHealth, now);
    expect(result.status).not.toBe("ready");
    expect(["blocked", "warning"]).toContain(result.status);
  });

  it("returns ready when rollout percent is 0", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
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
        gates: [{ gate: "test", status: "passed" }]
      },
      gates: {
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);
    expect(result.status).toBe("ready");
    expect(result.blockers).toHaveLength(0);
  });

  it("returns warning when rollout percent is 10 (canary already active)", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent: 10,
      apiHealth: {
        systemHealthy: true,
        unhealthyFeeds: [],
        totalFeeds: 3,
        healthyFeeds: 3
      },
      validation: {
        allValidationsPassed: true,
        readyForRollout: true,
        gates: [{ gate: "test", status: "passed" }]
      },
      gates: {
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);
    expect(result.status).toBe("warning");
    expect(result.warnings.some((w) => w.includes("10%"))).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("returns blocked when rollout percent > 10", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent: 50,
      apiHealth: {
        systemHealthy: true,
        unhealthyFeeds: [],
        totalFeeds: 3,
        healthyFeeds: 3
      },
      validation: {
        allValidationsPassed: true,
        readyForRollout: true,
        gates: [{ gate: "test", status: "passed" }]
      },
      gates: {
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);
    expect(result.status).toBe("blocked");
    expect(result.blockers.some((b) => b.includes("in progress"))).toBe(true);
  });

  it("returns blocked when API health has zero feeds", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent: 0,
      apiHealth: {
        systemHealthy: true,
        unhealthyFeeds: [],
        totalFeeds: 0,
        healthyFeeds: 0
      },
      validation: {
        allValidationsPassed: true,
        readyForRollout: true,
        gates: [{ gate: "test", status: "passed" }]
      },
      gates: {
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);
    expect(result.status).toBe("blocked");
    expect(result.blockers.some((b) => b.includes("No feeds"))).toBe(true);
  });

  it("returns blocked when gates total count is zero", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
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
        gates: [{ gate: "test", status: "passed" }]
      },
      gates: {
        passedCount: 0,
        totalCount: 0,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);
    expect(result.status).toBe("blocked");
    expect(result.blockers.some((b) => b.includes("pre-deploy gates"))).toBe(true);
  });

  it("returns blocked when validation gates array is empty", () => {
    const now = "2026-04-25T12:00:00.000Z";
    const evidence: ReadinessEvidence = {
      generatedAt: now,
      rolloutPercent: 0,
      apiHealth: {
        systemHealthy: true,
        unhealthyFeeds: [],
        totalFeeds: 3,
        healthyFeeds: 3
      },
      validation: {
        allValidationsPassed: false,
        readyForRollout: false,
        gates: []
      },
      gates: {
        passedCount: 4,
        totalCount: 4,
        allSigned: true
      }
    };

    const result = evaluateReadiness(evidence, now);
    expect(result.status).toBe("blocked");
    expect(result.blockers.some((b) => b.includes("validation gates"))).toBe(true);
  });
});
