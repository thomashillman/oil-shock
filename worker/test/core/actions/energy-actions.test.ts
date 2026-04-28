import { describe, expect, it } from "vitest";
import { buildEnergyActionDecision } from "../../../src/core/actions/energy-actions";

const baseEvent = {
  engineKey: "energy",
  ruleKey: "energy.confirmation.spread_widening",
  releaseKey: "2026-04-28",
  transitionKey: "inactive->active",
  previousState: "inactive",
  newState: "active",
  status: "confirmed",
  reason: "energy spreads crossed confirmation threshold",
  runKey: "run-1",
  triggeredAt: "2026-04-28T00:00:00.000Z",
  computed: null,
  details: { spread: 0.72 }
};

describe("buildEnergyActionDecision", () => {
  it("maps spread widening activation to log_only decision with deterministic decision key", () => {
    const draft = buildEnergyActionDecision(baseEvent);

    expect(draft).not.toBeNull();
    expect(draft).toMatchObject({
      engineKey: "energy",
      ruleKey: "energy.confirmation.spread_widening",
      releaseKey: "2026-04-28",
      decisionKey: "energy:energy.confirmation.spread_widening:2026-04-28:inactive->active",
      decision: "ignored",
      actionType: "log_only"
    });
    expect(draft?.rationale).toContain("logging-only");
    expect(draft?.rationale).toContain("no execution policy configured");
    expect(draft?.rationale).toContain("no trade execution");
  });

  it("returns ignored decision for unsupported transitions", () => {
    const draft = buildEnergyActionDecision({ ...baseEvent, transitionKey: "active->active" });

    expect(draft).not.toBeNull();
    expect(draft?.decision).toBe("ignored");
    expect(draft?.actionType).toBe("log_only");
  });

  it("returns error decision for malformed details instead of throwing", () => {
    const draft = buildEnergyActionDecision({ ...baseEvent, details: "bad-details" as unknown as Record<string, unknown> });

    expect(draft).not.toBeNull();
    expect(draft?.decision).toBe("error");
    expect(draft?.rationale).toContain("malformed");
  });
});
