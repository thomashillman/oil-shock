import { describe, expect, it, vi } from "vitest";
import { evaluateFreshness } from "../../src/core/freshness/evaluate";

describe("evaluateFreshness", () => {
  it("marks missing values correctly", () => {
    const output = evaluateFreshness({
      physicalObservedAt: null,
      recognitionObservedAt: null,
      transmissionObservedAt: null
    });
    expect(output).toEqual({
      physical: "missing",
      recognition: "missing",
      transmission: "missing"
    });
  });

  it("marks stale values outside the age window", () => {
    const now = new Date("2026-04-16T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const old = new Date("2026-03-01T00:00:00.000Z").toISOString();
    const output = evaluateFreshness({
      physicalObservedAt: old,
      recognitionObservedAt: old,
      transmissionObservedAt: old
    });

    expect(output).toEqual({
      physical: "stale",
      recognition: "stale",
      transmission: "stale"
    });
    vi.useRealTimers();
  });
});
