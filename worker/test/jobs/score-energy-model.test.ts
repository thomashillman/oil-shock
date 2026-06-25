import { describe, expect, it } from "vitest";
import { computeEnergyDislocationScore } from "../../src/jobs/score";

const WEIGHT = 0.15;

describe("computeEnergyDislocationScore", () => {
  it("Test A: high transmission stress alone does not create a high dislocation score", () => {
    const { scoreValue } = computeEnergyDislocationScore({
      physicalStress: 0.02,
      transmissionStress: 1.0,
      marketRecognition: 0.5,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    // hiddenMismatch = 0.02^2 * (1 - 0.5) = 0.0002; transmission = 1.0 * 0.15 = 0.15 => 0.1502
    // The squared physical-stress term mutes weak physical signal even harder than the old linear
    // shape, so high transmission alone still cannot manufacture a high score.
    expect(scoreValue).toBeCloseTo(0.1502, 5);
  });

  it("Test B: high physical stress with low market recognition produces an elevated score", () => {
    const { scoreValue } = computeEnergyDislocationScore({
      physicalStress: 0.7,
      transmissionStress: 0.6,
      marketRecognition: 0.2,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    // hiddenMismatch = 0.7^2 * (1 - 0.2) = 0.392; transmission = 0.6 * 0.15 = 0.09 => 0.482
    expect(scoreValue).toBeCloseTo(0.482, 5);
  });

  it("Test C: high physical stress with high market recognition reduces the hidden-dislocation score", () => {
    const { scoreValue } = computeEnergyDislocationScore({
      physicalStress: 0.7,
      transmissionStress: 0.6,
      marketRecognition: 0.9,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    // hiddenMismatch = 0.7^2 * (1 - 0.9) = 0.049; transmission = 0.09 => 0.139
    expect(scoreValue).toBeCloseTo(0.139, 5);
  });

  it("Test D: missing market recognition is provisional, not automatically confirming", () => {
    const { scoreValue, flags, confidence } = computeEnergyDislocationScore({
      physicalStress: 0.7,
      transmissionStress: 1.0,
      marketRecognition: null,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    // hiddenMismatch = 0.7^2 * 0.5 = 0.245; transmission = 1.0 * 0.15 = 0.15 => 0.395
    // The missing-recognition fallback uses the SAME squared physical-stress baseline.
    expect(scoreValue).toBeCloseTo(0.395, 5);
    expect(flags).toContain("missing_price_confirmation");
    expect(confidence).toBe(0.6);
  });

  it("Test E: rule adjustments still apply", () => {
    const { scoreValue } = computeEnergyDislocationScore({
      physicalStress: 0.7,
      transmissionStress: 0.6,
      marketRecognition: 0.2,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0.1
    });

    // base 0.482 + rule 0.10 => 0.582
    expect(scoreValue).toBeCloseTo(0.582, 5);
  });

  it("Test H: the squared shape makes risk accelerate as physical stress rises", () => {
    const base = {
      transmissionStress: 0,
      marketRecognition: 0,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    };
    // With recognition = 0 the score is purely physicalStress^2. Doubling physical stress from
    // 0.4 to 0.8 should roughly quadruple the score, not double it (linear would give 0.4 -> 0.8).
    const low = computeEnergyDislocationScore({ ...base, physicalStress: 0.4 });
    const high = computeEnergyDislocationScore({ ...base, physicalStress: 0.8 });
    expect(low.scoreValue).toBeCloseTo(0.16, 5);
    expect(high.scoreValue).toBeCloseTo(0.64, 5);
  });

  it("Test F: the final score is clamped to [0, 1]", () => {
    const high = computeEnergyDislocationScore({
      physicalStress: 1.0,
      transmissionStress: 1.0,
      marketRecognition: 0.0,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0.5
    });
    // 1.0 + 0.15 + 0.5 would be 1.65 before clamping
    expect(high.scoreValue).toBe(1);

    const low = computeEnergyDislocationScore({
      physicalStress: 0.1,
      transmissionStress: 0.0,
      marketRecognition: 0.5,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: -0.5
    });
    // 0.05 - 0.5 would be negative before clamping
    expect(low.scoreValue).toBe(0);
  });

  it("present recognition keeps confidence at 0.8 and adds no missing-price flag", () => {
    const { flags, confidence } = computeEnergyDislocationScore({
      physicalStress: 0.5,
      transmissionStress: 0.3,
      marketRecognition: 0.4,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    expect(flags).toHaveLength(0);
    expect(confidence).toBe(0.8);
  });
});
