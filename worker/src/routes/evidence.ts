import type { Env } from "../env";
import { getLatestRunEvidence, getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";

export async function handleGetEvidence(env: Env): Promise<Response> {
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

  const evidenceRows = await getLatestRunEvidence(env);
  const evidence = evidenceRows.map((row) => ({
    evidenceKey: row.evidence_key,
    evidenceGroup: row.evidence_group,
    evidenceGroupLabel: row.evidence_group_label,
    observedAt: row.observed_at,
    contribution: row.contribution,
    classification: row.evidence_classification,
    coverage: row.coverage_quality,
    details: JSON.parse(row.details_json)
  }));

  return json({
    generatedAt: snapshot.generated_at,
    evidence
  });
}
