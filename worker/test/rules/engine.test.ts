import { describe, expect, it } from "vitest";
import { evaluateRules, isRulePredicate, type RuleDefinition } from "../../src/core/rules/engine";

describe("rule engine", () => {
  it("applies threshold adjustments and ignores unmatched rules", () => {
    const rules: RuleDefinition[] = [
      { id: 1, engineKey: "oil_shock", ruleKey: "physical-up", name: "Physical pressure boosts mismatch", action: "adjust_mismatch", weight: 0.05, predicate: { type: "threshold", metric: "physicalStress", operator: ">=", value: 0.7 } },
      { id: 2, engineKey: "oil_shock", ruleKey: "price-down", name: "Low price signal boosts mismatch", action: "adjust_mismatch", weight: 0.04, predicate: { type: "threshold", metric: "priceSignal", operator: "<=", value: 0.3 } },
      { id: 3, engineKey: "oil_shock", ruleKey: "market-noop", name: "No-op unmatched", action: "adjust_mismatch", weight: 0.9, predicate: { type: "threshold", metric: "marketResponse", operator: ">=", value: 0.95 } }
    ];

    const result = evaluateRules(rules, { physicalStress: 0.71, priceSignal: 0.2, marketResponse: 0.4 });

    expect(result.totalAdjustment).toBeCloseTo(0.09, 6);
    expect(result.appliedRules.map((rule) => rule.ruleKey)).toEqual(["physical-up", "price-down"]);
  });

  it("supports cross-feed conditions", () => {
    const rules: RuleDefinition[] = [
      {
        id: 4,
        engineKey: "oil_shock",
        ruleKey: "recognition-gap",
        name: "Physical high + price low confirmation",
        action: "adjust_mismatch",
        weight: 0.06,
        predicate: {
          type: "all",
          predicates: [
            { type: "threshold", metric: "physicalStress", operator: ">=", value: 0.65 },
            { type: "threshold", metric: "priceSignal", operator: "<=", value: 0.35 }
          ]
        }
      }
    ];

    const result = evaluateRules(rules, { physicalStress: 0.72, priceSignal: 0.3, marketResponse: 0.2 });

    expect(result.totalAdjustment).toBe(0.06);
    expect(result.appliedRules).toHaveLength(1);
  });

  it("validates supported predicates", () => {
    expect(isRulePredicate({ type: "threshold", metric: "physicalStress", operator: ">=", value: 0.5 })).toBe(true);
    expect(isRulePredicate({ type: "threshold", metric: "bad_metric", operator: ">=", value: 0.5 })).toBe(false);
  });
});
