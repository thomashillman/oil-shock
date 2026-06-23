import type { Env } from "../env";
import { getLatestEngineScore } from "../db/client";
import { json } from "../lib/http";

export async function handleGetEnergyState(env: Env): Promise<Response> {
  const row = await getLatestEngineScore(env, "energy", "energy.state");
  if (!row) {
    return json(
      {
        error: "no_score",
        message: "No precomputed energy score is available yet."
      },
      { status: 404 }
    );
  }

  return json({
    engineKey: row.engine_key,
    feedKey: row.feed_key,
    scoredAt: row.scored_at,
    scoreValue: row.score_value,
    confidence: row.confidence,
    flags: row.flags_json ? JSON.parse(row.flags_json) : []
  });
}
