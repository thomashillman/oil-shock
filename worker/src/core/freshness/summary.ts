import type { DislocationState, FreshnessSummary } from "../../types";

type FreshnessKey = keyof FreshnessSummary;

function parseFreshnessValue(raw: Record<string, string>, key: FreshnessKey): FreshnessSummary[FreshnessKey] {
  const legacyKey =
    key === "physicalStress" ? "physical" : key === "priceSignal" ? "recognition" : "transmission";
  const modernValue = raw[key];
  const legacyValue = raw[legacyKey];
  return (modernValue ?? legacyValue ?? "missing") as FreshnessSummary[FreshnessKey];
}

export function parseSnapshotFreshness(sourceFreshnessJson: string): FreshnessSummary {
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

export function toLegacyFreshness(freshness: FreshnessSummary): FreshnessSummary {
  return freshness;
}

export function countStaleFreshness(freshness: FreshnessSummary): number {
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
