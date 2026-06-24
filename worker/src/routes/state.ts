import type { Env } from "../env";
import { getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";
import { handleGetStateV2 } from "./state-v2";

export async function handleGetState(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const version = url.searchParams.get("version");

  // Route to scores-backed endpoint only if explicitly requested with v2 parameter
  // Default (no param) is snapshot-backed for backward compatibility
  if (version === "v2") {
    return handleGetStateV2(env);
  }

  // Otherwise use snapshot-backed path (snapshot or legacy)
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

  const response = json({
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
    evidenceIds: JSON.parse(snapshot.evidence_ids_json),
    guardrailFlags: snapshot.guardrail_flags_json ? JSON.parse(snapshot.guardrail_flags_json) : []
  });

  // Add deprecation header if using legacy version parameter
  if (version === "legacy") {
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", "Sun, 30 Jun 2026 00:00:00 GMT");
  }

  return response;
}
