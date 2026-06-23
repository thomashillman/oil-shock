import type { Env } from "../env";
import { getLatestSnapshot } from "../db/client";
import { parseSnapshotFreshness, toLegacyFreshness } from "../core/freshness/summary";
import { json } from "../lib/http";

function buildFeedFreshness(freshness: ReturnType<typeof parseSnapshotFreshness>) {
  return {
    spot_wti: freshness.priceSignal,
    curve_slope: freshness.priceSignal,
    inventory_draw: freshness.physicalStress,
    refinery_utilization: freshness.physicalStress,
    crack_spread: freshness.marketResponse,
    eu_pipeline_flow: freshness.physicalStress,
    eu_gas_storage: freshness.physicalStress,
    sec_impairment: freshness.marketResponse
  };
}

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

  const freshness = parseSnapshotFreshness(snapshot.source_freshness_json);
  const feedFreshness = buildFeedFreshness(freshness);

  return json({
    generatedAt: snapshot.generated_at,
    coverageConfidence: snapshot.coverage_confidence,
    sourceFreshness: freshness,
    feedFreshness,
    generated_at: snapshot.generated_at,
    coverage_confidence: snapshot.coverage_confidence,
    source_freshness: toLegacyFreshness(freshness),
    feed_freshness: feedFreshness
  });
}
