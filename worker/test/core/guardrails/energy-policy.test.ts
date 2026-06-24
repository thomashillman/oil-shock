import { describe, expect, it } from "vitest";
import { evaluateEnergyGuardrailPolicy } from "../../../src/core/guardrails/energy-policy";
import type { TriggerEventRow } from "../../../src/db/macro";

const baseEvent: TriggerEventRow = {
  engineKey: "energy",
  ruleKey: "energy.confirmation.spread_widening",
  releaseKey: "2026-04-28",
  transitionKey: "inactive->active",
  previousState: "inactive",
  newState: "active",
  status: "confirmed",
  reason: "threshold crossed",
  runKey: "run-1",
  triggeredAt: "2026-04-28T00:00:00.000Z",
  computed: null,
  details: { spread: 0.72 }
};

describe("evaluateEnergyGuardrailPolicy", () => {
  it("returns ignored log_only decision with explicit guardrail rationale for supported trigger", () => {
    const result = evaluateEnergyGuardrailPolicy({
      event: baseEvent,
      duplicateDecisionExists: false,
      sameRuleReleaseDecisionExists: false
    });

    expect(result.decision).toBe("ignored");
    expect(result.actionType).toBe("log_only");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "duplicate_trigger", status: "passed" }),
        expect.objectContaining({ key: "same_rule_release", status: "passed" }),
        expect.objectContaining({ key: "execution_policy", status: "not_configured" }),
        expect.objectContaining({ key: "cooldown", status: "not_configured" })
      ])
    );
    expect(result.rationale).toContain("confirmed trigger recorded");
    expect(result.rationale).toContain("no execution policy configured");
    expect(result.rationale).toContain("no trade execution occurred");
  });

  it("returns ignored with duplicate guardrail status when decision key already exists", () => {
    const result = evaluateEnergyGuardrailPolicy({
      event: baseEvent,
      duplicateDecisionExists: true,
      sameRuleReleaseDecisionExists: false
    });

    expect(result.decision).toBe("ignored");
    expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ key: "duplicate_trigger", status: "blocked" })]));
    expect(result.rationale).toContain("already has decision");
  });

  it("returns blocked when same engine + rule + release already has a decision", () => {
    const result = evaluateEnergyGuardrailPolicy({
      event: { ...baseEvent, transitionKey: "active->active" },
      duplicateDecisionExists: false,
      sameRuleReleaseDecisionExists: true
    });

    expect(result.decision).toBe("blocked");
    expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ key: "same_rule_release", status: "blocked" })]));
    expect(result.rationale).toContain("already has a decision");
  });

  it("returns ignored for unsupported energy triggers", () => {
    const result = evaluateEnergyGuardrailPolicy({
      event: { ...baseEvent, ruleKey: "energy.unknown" },
      duplicateDecisionExists: false,
      sameRuleReleaseDecisionExists: false
    });

    expect(result.decision).toBe("ignored");
    expect(result.rationale).toContain("unsupported");
  });

  it("returns error for malformed identity fields", () => {
    const result = evaluateEnergyGuardrailPolicy({
      event: { ...baseEvent, releaseKey: "" },
      duplicateDecisionExists: false,
      sameRuleReleaseDecisionExists: false
    });

    expect(result.decision).toBe("error");
    expect(result.rationale).toContain("missing required identity");
  });

  it("includes cooldown placeholder details as not_configured", () => {
    const result = evaluateEnergyGuardrailPolicy({
      event: baseEvent,
      duplicateDecisionExists: false,
      sameRuleReleaseDecisionExists: false
    });

    expect(result.details).toMatchObject({ cooldown: { status: "not_configured" } });
  });
});
