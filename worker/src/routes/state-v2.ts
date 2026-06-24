import type { Env } from "../env";
import { getLatestEngineScore } from "../db/client";
import { json } from "../lib/http";

export async function handleGetStateV2(env: Env): Promise<Response> {
  const scoreRow = await getLatestEngineScore(env, "oil_shock", "oil_shock.mismatch_score");
  if (!scoreRow) {
    return json(
      {
        error: "no_score",
        message: "No Oil Shock score available yet."
      },
      { status: 404 }
    );
  }

  let flags: Record<string, unknown> = {};
  if (scoreRow.flags_json) {
    try {
      flags = JSON.parse(scoreRow.flags_json);
    } catch {
      // Leave empty if parse fails
    }
  }

  return json({
    generatedAt: scoreRow.scored_at,
    mismatchScore: scoreRow.score_value,
    dislocationState: flags.state || "unknown",
    stateRationale: flags.stateRationale || "",
    actionabilityState: flags.actionabilityState || "none",
    confidence: flags.confidence || {
      coverage: scoreRow.confidence ?? 0.5,
      sourceQuality: {}
    },
    subscores: flags.subscores || {
      physicalStress: 0,
      priceSignal: 0,
      marketResponse: 0
    },
    clocks: flags.clocks || {
      shock: { ageSeconds: 0, label: "", classification: "acute" },
      dislocation: { ageSeconds: 0, label: "", classification: "acute" },
      transmission: { ageSeconds: 0, label: "", classification: "acute" }
    },
    ledgerImpact: flags.ledgerImpact || null,
    coverageConfidence: scoreRow.confidence ?? 0.5,
    sourceFreshness: flags.sourceFreshness || {
      physicalStress: "missing",
      priceSignal: "missing",
      marketResponse: "missing"
    },
    evidenceIds: flags.evidenceIds || [],
    guardrailFlags: flags.guardrailFlags || []
  });
}
