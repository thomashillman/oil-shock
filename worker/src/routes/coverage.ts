import type { Env } from "../env";
import { getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";

const FEED_TO_DIMENSION: Record<string, "physicalStress" | "priceSignal" | "marketResponse"> = {
  spot_wti: "priceSignal",
  curve_slope: "priceSignal",
  inventory_draw: "physicalStress",
  refinery_utilization: "physicalStress",
  crack_spread: "marketResponse",
  eu_pipeline_flow: "physicalStress",
  eu_gas_storage: "physicalStress",
  sec_impairment: "marketResponse"
};

export async function handleGetCoverage(env: Env): Promise<Response> {
  const snapshot = await getLatestSnapshot(env);
  if (!snapshot) {
    return json(
      {
        error: "no_snapshot",
        message: "No snapshot is available yet."
      },
      { status: 404 }
    );
  }

  const sourceFreshness = JSON.parse(snapshot.source_freshness_json) as Record<
    "physicalStress" | "priceSignal" | "marketResponse",
    "fresh" | "stale" | "missing"
  >;

  const feedFreshness = Object.fromEntries(
    Object.entries(FEED_TO_DIMENSION).map(([feedKey, dimension]) => [feedKey, sourceFreshness[dimension]])
  );

  return json({
    generated_at: snapshot.generated_at,
    coverage_confidence: snapshot.coverage_confidence,
    source_freshness: sourceFreshness,
    feed_freshness: feedFreshness
  });
}
