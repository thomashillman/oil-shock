import { describe, expect, it } from "vitest";
import { computeSnapshot } from "../../src/core/scoring/compute";

describe("computeSnapshot", () => {
  it("returns actionable when score is high and confirmations are met", () => {
    const now = new Date().toISOString();
    const result = computeSnapshot({
      nowIso: now,
      physicalPressure: 0.9,
      recognition: 0.2,
      transmission: 0.8,
      physicalObservedAt: now,
      recognitionObservedAt: now,
      transmissionObservedAt: now,
      freshness: {
        physical: "fresh",
        recognition: "fresh",
        transmission: "fresh"
      }
    });

    expect(result.snapshot.actionabilityState).toBe("actionable");
    expect(result.snapshot.mismatchScore).toBeGreaterThan(0.65);
  });

  it("downgrades to watch when mismatch is present but confirmation gate is not met", () => {
    const now = new Date().toISOString();
    const result = computeSnapshot({
      nowIso: now,
      physicalPressure: 0.8,
      recognition: 0.25,
      transmission: 0.7,
      physicalObservedAt: now,
      recognitionObservedAt: now,
      transmissionObservedAt: now,
      freshness: {
        physical: "stale",
        recognition: "fresh",
        transmission: "stale"
      }
    });

    expect(result.snapshot.actionabilityState).toBe("watch");
  });
});
