import type { DislocationState, FreshnessSummary, LiveFreshnessSummary } from "../../types";

type FreshnessKey = keyof LiveFreshnessSummary;

function parseFreshnessValue(raw: Record<string, string>, key: FreshnessKey): LiveFreshnessSummary[FreshnessKey] {
  const legacyKey =
    key === "physicalStress" ? "physical" : key === "priceSignal" ? "recognition" : "transmission";
  const modernValue = raw[key];
  const legacyValue = raw[legacyKey];
  return (modernValue ?? legacyValue ?? "missing") as LiveFreshnessSummary[FreshnessKey];
}

export function parseSnapshotFreshness(sourceFreshnessJson: string): LiveFreshnessSummary {
  try {
    const raw = JSON.parse(sourceFreshnessJson) as Record<string, string>;
    return {
      physicalStress: parseFreshnessValue(raw, "physicalStress"),
      priceSignal: parseFreshnessValue(raw, "priceSignal"),
      marketResponse: parseFreshnessValue(raw, "marketResponse")
    };
  } catch {
    return { physicalStress: "missing", priceSignal: "missing", marketResponse: "missing" };
  }
}

export function toLegacyFreshness(freshness: LiveFreshnessSummary): FreshnessSummary {
  return {
    physical: freshness.physicalStress,
    recognition: freshness.priceSignal,
    transmission: freshness.marketResponse
  };
}

export function countStaleFreshness(freshness: LiveFreshnessSummary): number {
  return Object.values(freshness).filter((value) => value !== "fresh").length;
}

export function buildStateRationale(dislocationState: DislocationState, staleCount: number): string {
  const base =
    dislocationState === "aligned"
      ? "Physical pressure is modest; market recognition aligned."
      : dislocationState === "mild_divergence"
        ? "Physical pressure is rising faster than recognition."
        : dislocationState === "persistent_divergence"
          ? "Physical pressure is outpacing market recognition."
          : "Physical pressure is outrunning market response.";

  return staleCount > 0 ? `${base} [STALE DATA: confidence downgraded]` : base;
}
