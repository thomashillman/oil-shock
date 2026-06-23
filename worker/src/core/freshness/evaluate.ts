import type { FreshnessSummary } from "../../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function evaluateRecency(observedAt: string | null, maxAgeDays: number): "fresh" | "stale" | "missing" {
  if (!observedAt) {
    return "missing";
  }
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) {
    return "stale";
  }
  return Date.now() - observed <= maxAgeDays * DAY_MS ? "fresh" : "stale";
}

export function evaluateFreshness(inputs: {
  physicalStressObservedAt: string | null;
  priceSignalObservedAt: string | null;
  marketResponseObservedAt: string | null;
}): FreshnessSummary {
  return {
    physicalStress: evaluateRecency(inputs.physicalStressObservedAt, 8),
    priceSignal: evaluateRecency(inputs.priceSignalObservedAt, 3),
    marketResponse: evaluateRecency(inputs.marketResponseObservedAt, 8)
  };
}
