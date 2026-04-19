import { describe, expect, it, vi } from "vitest";
import { evaluateFreshness } from "../../src/core/freshness/evaluate";

describe("evaluateFreshness", () => {
  it("marks missing values correctly", () => {
    const output = evaluateFreshness({
      physicalStressObservedAt: null,
      priceSignalObservedAt: null,
      marketResponseObservedAt: null
    });
    expect(output).toEqual({
      physicalStress: "missing",
      priceSignal: "missing",
      marketResponse: "missing"
    });
  });

  it("marks stale values outside the age window", () => {
    const now = new Date("2026-04-16T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const old = new Date("2026-03-01T00:00:00.000Z").toISOString();
    const output = evaluateFreshness({
      physicalStressObservedAt: old,
      priceSignalObservedAt: old,
      marketResponseObservedAt: old
    });

    expect(output).toEqual({
      physicalStress: "stale",
      priceSignal: "stale",
      marketResponse: "stale"
    });
    vi.useRealTimers();
  });
});
