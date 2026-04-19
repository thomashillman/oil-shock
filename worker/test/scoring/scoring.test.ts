import { describe, expect, it } from "vitest";
import { computeSnapshot } from "../../src/core/scoring/compute";
import type { ScoringThresholds } from "../../src/types";

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

describe("computeSnapshot", () => {
  it("returns actionable when score is high and confirmations are met", () => {
    const now = new Date().toISOString();
    const result = computeSnapshot({
      nowIso: now,
      physicalStress: 0.9,
      priceSignal: 0.2,
      marketResponse: 0.8,
      physicalStressObservedAt: now,
      priceSignalObservedAt: now,
      marketResponseObservedAt: now,
      freshness: {
        physicalStress: "fresh",
        priceSignal: "fresh",
        marketResponse: "fresh"
      },
      thresholds
    });

    expect(result.snapshot.actionabilityState).toBe("actionable");
    expect(result.snapshot.mismatchScore).toBeGreaterThan(0.65);
  });

  it("downgrades to watch when mismatch is present but confirmation gate is not met", () => {
    const now = new Date().toISOString();
    const result = computeSnapshot({
      nowIso: now,
      physicalStress: 0.8,
      priceSignal: 0.25,
      marketResponse: 0.7,
      physicalStressObservedAt: now,
      priceSignalObservedAt: now,
      marketResponseObservedAt: now,
      freshness: {
        physicalStress: "stale",
        priceSignal: "fresh",
        marketResponse: "stale"
      },
      thresholds
    });

    expect(result.snapshot.actionabilityState).toBe("watch");
  });
});
