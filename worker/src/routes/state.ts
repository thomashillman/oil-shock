import type { Env } from "../env";
import { getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";

export async function handleGetState(env: Env): Promise<Response> {
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
    generatedAt: snapshot.generated_at,
    mismatchScore: snapshot.mismatch_score,
    dislocationState: JSON.parse(snapshot.dislocation_state_json),
    stateRationale: snapshot.state_rationale,
    actionabilityState: snapshot.actionability_state,
    confidence: {
      coverage: snapshot.coverage_confidence,
      sourceQuality: JSON.parse(snapshot.source_freshness_json)
    },
    subscores: JSON.parse(snapshot.subscores_json),
    clocks: JSON.parse(snapshot.clocks_json),
    ledgerImpact: snapshot.ledger_impact_json ? JSON.parse(snapshot.ledger_impact_json) : null,
    coverageConfidence: snapshot.coverage_confidence,
    sourceFreshness: JSON.parse(snapshot.source_freshness_json),
    evidenceIds: JSON.parse(snapshot.evidence_ids_json)
  });
}
