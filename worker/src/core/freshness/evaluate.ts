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
  physicalObservedAt: string | null;
  recognitionObservedAt: string | null;
  transmissionObservedAt: string | null;
}): FreshnessSummary {
  return {
    physical: evaluateRecency(inputs.physicalObservedAt, 8),
    recognition: evaluateRecency(inputs.recognitionObservedAt, 3),
    transmission: evaluateRecency(inputs.transmissionObservedAt, 8)
  };
}
