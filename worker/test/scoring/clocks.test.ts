import { describe, expect, it } from "vitest";
import { computeClocks } from "../../src/core/scoring/clocks";

describe("computeClocks", () => {
  const now = new Date("2026-04-16T12:00:00Z");
  const nowIso = now.toISOString();

  it("computes shock age correctly", () => {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const clocks = computeClocks({
      nowIso,
      durationInCurrentStateSeconds: 3600, // 1 hour
      firstTransmissionSignalObservedAt: null,
      firstMismatchObservedAt: twoHoursAgo,
    });

    expect(clocks.shock.ageSeconds).toBeCloseTo(7200, 100); // approximately 2 hours
    expect(clocks.shock.label).toContain("hour");
  });

  it("marks shock as acute when less than 72 hours old", () => {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const clocks = computeClocks({
      nowIso,
      durationInCurrentStateSeconds: 1800,
      firstTransmissionSignalObservedAt: null,
      firstMismatchObservedAt: oneHourAgo,
    });

    expect(clocks.shock.classification).toBe("acute");
  });

  it("marks shock as chronic when 72 hours or older", () => {
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const clocks = computeClocks({
      nowIso,
      durationInCurrentStateSeconds: 3 * 24 * 3600,
      firstTransmissionSignalObservedAt: null,
      firstMismatchObservedAt: fourDaysAgo,
    });

    expect(clocks.shock.classification).toBe("chronic");
  });

  it("computes dislocation age from state duration", () => {
    const durationSeconds = 2 * 24 * 3600; // 2 days
    const clocks = computeClocks({
      nowIso,
      durationInCurrentStateSeconds: durationSeconds,
      firstTransmissionSignalObservedAt: null,
      firstMismatchObservedAt: null,
    });

    expect(clocks.dislocation.ageSeconds).toBe(durationSeconds);
    expect(clocks.dislocation.label).toContain("day");
  });

  it("marks transmission as emerging when no signal yet", () => {
    const clocks = computeClocks({
      nowIso,
      durationInCurrentStateSeconds: 3600,
      firstTransmissionSignalObservedAt: null,
      firstMismatchObservedAt: null,
    });

    expect(clocks.transmission.classification).toBe("emerging");
    expect(clocks.transmission.label).toBe("none yet");
  });
});
