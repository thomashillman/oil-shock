import type { Env } from "../env";
import { getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";

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

  return json({
    generated_at: snapshot.generated_at,
    coverage_confidence: snapshot.coverage_confidence,
    source_freshness: JSON.parse(snapshot.source_freshness_json)
  });
}
