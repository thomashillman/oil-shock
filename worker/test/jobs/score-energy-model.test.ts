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

    // hiddenMismatch = 0.02 * (1 - 0.5) = 0.01; transmission = 1.0 * 0.15 = 0.15 => 0.16
    // (The old (physicalStress + marketResponse) / 2 formula produced a false 0.51 here.)
    expect(scoreValue).toBeCloseTo(0.16, 5);
  });

  it("Test B: high physical stress with low market recognition produces an elevated score", () => {
    const { scoreValue } = computeEnergyDislocationScore({
      physicalStress: 0.7,
      transmissionStress: 0.6,
      marketRecognition: 0.2,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    // hiddenMismatch = 0.7 * (1 - 0.2) = 0.56; transmission = 0.6 * 0.15 = 0.09 => 0.65
    expect(scoreValue).toBeCloseTo(0.65, 5);
  });

  it("Test C: high physical stress with high market recognition reduces the hidden-dislocation score", () => {
    const { scoreValue } = computeEnergyDislocationScore({
      physicalStress: 0.7,
      transmissionStress: 0.6,
      marketRecognition: 0.9,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    // hiddenMismatch = 0.7 * (1 - 0.9) = 0.07; transmission = 0.09 => 0.16
    expect(scoreValue).toBeCloseTo(0.16, 5);
  });

  it("Test D: missing market recognition is provisional, not automatically confirming", () => {
    const { scoreValue, flags, confidence } = computeEnergyDislocationScore({
      physicalStress: 0.7,
      transmissionStress: 1.0,
      marketRecognition: null,
      mismatchMarketResponseWeight: WEIGHT,
      ruleAdjustment: 0
    });

    // hiddenMismatch = 0.7 * 0.5 = 0.35; transmission = 1.0 * 0.15 = 0.15 => 0.50
    expect(scoreValue).toBeCloseTo(0.5, 5);
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

    // base 0.65 + rule 0.10 => 0.75
    expect(scoreValue).toBeCloseTo(0.75, 5);
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
