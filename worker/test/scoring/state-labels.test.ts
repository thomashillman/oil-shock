import { describe, expect, it } from "vitest";
import { computeDislocationState } from "../../src/core/scoring/state-labels";
import type { Subscores, ScoringThresholds } from "../../src/types";

const freshFreshness = { physical: "fresh" as const, recognition: "fresh" as const, transmission: "fresh" as const };
const staleFreshness = { physical: "stale" as const, recognition: "stale" as const, transmission: "stale" as const };

const thresholds: ScoringThresholds = {
  stateAlignedMax: 0.3,
  stateMildMin: 0.3,
  stateMildMax: 0.5,
  statePersistentMin: 0.5,
  statePersistentMax: 0.75,
  stateDeepMin: 0.75,
  shockAgeThresholdHours: 72,
  dislocationPersistenceHours: 72,
  ledgerAdjustmentMagnitude: 0.1
};

describe("computeDislocationState", () => {
  it("returns aligned when score is low and physical pressure is low", () => {
    const subscores: Subscores = { physical: 0.2, recognition: 0.7, transmission: 0.3 };
    const result = computeDislocationState(0.2, subscores, freshFreshness, 0, thresholds);

    expect(result.state).toBe("aligned");
    expect(result.rationale).toContain("modest");
  });

  it("returns mild_divergence when score is in mild range", () => {
    const subscores: Subscores = { physical: 0.65, recognition: 0.3, transmission: 0.4 };
    const result = computeDislocationState(0.45, subscores, freshFreshness, 0, thresholds);

    expect(result.state).toBe("mild_divergence");
    expect(result.rationale).toContain("emerging");
  });

  it("returns persistent_divergence when score is high, duration > 3 days, all signals align", () => {
    const subscores: Subscores = { physical: 0.75, recognition: 0.2, transmission: 0.6 };
    const durationSeconds = 4 * 24 * 3600; // 4 days
    const result = computeDislocationState(0.65, subscores, freshFreshness, durationSeconds, thresholds);

    expect(result.state).toBe("persistent_divergence");
    expect(result.rationale).toContain("persists");
  });

  it("returns deep_divergence when score >= 0.75, all confirmations met, duration >= 5 days", () => {
    const subscores: Subscores = { physical: 0.8, recognition: 0.2, transmission: 0.75 };
    const durationSeconds = 6 * 24 * 3600; // 6 days
    const result = computeDislocationState(0.75, subscores, freshFreshness, durationSeconds, thresholds);

    expect(result.state).toBe("deep_divergence");
    expect(result.rationale).toContain("deep");
  });

  it("downgrades to aligned when critical data is stale", () => {
    const subscores: Subscores = { physical: 0.8, recognition: 0.2, transmission: 0.7 };
    const result = computeDislocationState(0.75, subscores, staleFreshness, 86400, thresholds);

    expect(result.state).toBe("aligned");
    expect(result.rationale).toContain("STALE DATA");
  });

  it("escalates to transmission_phase when transmission rises significantly", () => {
    const subscores: Subscores = { physical: 0.65, recognition: 0.25, transmission: 0.85 };
    const durationSeconds = 4 * 24 * 3600; // 4 days
    const result = computeDislocationState(0.7, subscores, freshFreshness, durationSeconds, thresholds);

    expect(result.state).toBe("persistent_divergence");
    expect(result.rationale).toContain("transmission");
  });
});
