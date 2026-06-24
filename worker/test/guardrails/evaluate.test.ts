import { describe, expect, it } from "vitest";
import { evaluateGuardrails } from "../../src/core/guardrails/evaluate";

describe("guardrails", () => {
  it("flags stale and missing dimensions", () => {
    const result = evaluateGuardrails({
      freshness: {
        physicalStress: "fresh",
        priceSignal: "stale",
        marketResponse: "missing"
      },
      feedCompleteness: {
        "price_signal.spot_wti": true,
        "price_signal.curve_slope": false
      }
    });

    expect(result.flags).toEqual([
      "stale_dimension:priceSignal",
      "missing_dimension:marketResponse",
      "missing_feed:price_signal.curve_slope"
    ]);
  });
});
