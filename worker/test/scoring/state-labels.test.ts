import { describe, expect, it } from "vitest";
import { computeDislocationState } from "../../src/core/scoring/state-labels";
import type { Subscores, ScoringThresholds } from "../../src/types";

const freshFreshness = { physicalStress: "fresh" as const, priceSignal: "fresh" as const, marketResponse: "fresh" as const };
const staleFreshness = { physicalStress: "stale" as const, priceSignal: "stale" as const, marketResponse: "stale" as const };

const thresholds: ScoringThresholds = {
  stateAlignedMax: 0.3,
  stateMildMin: 0.3,
  stateMildMax: 0.5,
  statePersistentMin: 0.5,
  statePersistentMax: 0.75,
  stateDeepMin: 0.75,
  shockAgeThresholdHours: 72,
  dislocationPersistenceHours: 72,
  ledgerAdjustmentMagnitude: 0.1,
  mismatchMarketResponseWeight: 0.15,
  confirmationPhysicalStressMin: 0.6,
  confirmationPriceSignalMax: 0.45,
  confirmationMarketResponseMin: 0.5,
  coverageMissingPenalty: 0.34,
  coverageStalePenalty: 0.16,
  coverageMaxPenalty: 1.0,
  stateDeepPersistenceHours: 120,
  statePersistentPersistenceHours: 72,
  ledgerStaleThresholdDays: 30
};

describe("computeDislocationState", () => {
  it("returns aligned when score is low and physical pressure is low", () => {
    const subscores: Subscores = { physicalStress: 0.2, priceSignal: 0.7, marketResponse: 0.3 };
    const result = computeDislocationState(0.2, subscores, freshFreshness, 0, thresholds);

    expect(result.state).toBe("aligned");
    expect(result.rationale).toContain("modest");
  });

  it("returns mild_divergence when score is in mild range", () => {
    const subscores: Subscores = { physicalStress: 0.65, priceSignal: 0.3, marketResponse: 0.4 };
    const result = computeDislocationState(0.45, subscores, freshFreshness, 0, thresholds);

    expect(result.state).toBe("mild_divergence");
    expect(result.rationale).toContain("emerging");
  });

  it("returns persistent_divergence when score is high, duration > 3 days, all signals align", () => {
    const subscores: Subscores = { physicalStress: 0.75, priceSignal: 0.2, marketResponse: 0.6 };
    const durationSeconds = 4 * 24 * 3600; // 4 days
    const result = computeDislocationState(0.65, subscores, freshFreshness, durationSeconds, thresholds);

    expect(result.state).toBe("persistent_divergence");
    expect(result.rationale).toContain("persists");
  });

  it("returns deep_divergence when score >= 0.75, all confirmations met, duration >= 5 days", () => {
    const subscores: Subscores = { physicalStress: 0.8, priceSignal: 0.2, marketResponse: 0.75 };
    const durationSeconds = 6 * 24 * 3600; // 6 days
    const result = computeDislocationState(0.75, subscores, freshFreshness, durationSeconds, thresholds);

    expect(result.state).toBe("deep_divergence");
    expect(result.rationale).toContain("deep");
  });

  it("downgrades to aligned when critical data is stale", () => {
    const subscores: Subscores = { physicalStress: 0.8, priceSignal: 0.2, marketResponse: 0.7 };
    const result = computeDislocationState(0.75, subscores, staleFreshness, 86400, thresholds);

    expect(result.state).toBe("aligned");
    expect(result.rationale).toContain("STALE DATA");
  });

  it("stays mild_divergence when score is high but duration gate not met (null duration)", () => {
    const subscores: Subscores = { physicalStress: 0.85, priceSignal: 0.2, marketResponse: 0.75 };
    const result = computeDislocationState(0.8, subscores, freshFreshness, null, thresholds);

    expect(result.state).toBe("mild_divergence");
  });

  it("escalates to transmission_phase when market response rises significantly", () => {
    const subscores: Subscores = { physicalStress: 0.65, priceSignal: 0.25, marketResponse: 0.85 };
    const durationSeconds = 4 * 24 * 3600; // 4 days
    const result = computeDislocationState(0.7, subscores, freshFreshness, durationSeconds, thresholds);

    expect(result.state).toBe("persistent_divergence");
    expect(result.rationale).toContain("transmission");
  });
});
