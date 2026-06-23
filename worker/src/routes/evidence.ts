import type { Env } from "../env";
import { getLatestSnapshot, getRunEvidenceBySnapshotRunKey } from "../db/client";
import { parseSnapshotFreshness } from "../core/freshness/summary";
import { json } from "../lib/http";
import type { LiveFreshnessSummary } from "../types";

function coverageForDimension(value: "fresh" | "stale" | "missing") {
  if (value === "fresh") {
    return "well";
  }
  if (value === "stale") {
    return "weakly";
  }
  return "not_covered";
}

const evidenceLabelMap = {
  physical: "physical_reality",
  physicalStress: "physical_reality",
  recognition: "market_recognition",
  priceSignal: "market_recognition",
  marketResponse: "transmission_pressure"
} as const;

const freshnessKeyMap = {
  physical: "physicalStress",
  physicalStress: "physicalStress",
  recognition: "priceSignal",
  priceSignal: "priceSignal",
  marketResponse: "marketResponse"
} as const;

function classifyEvidence(
  evidenceKey: string,
  contribution: number
): "confirming" | "counterevidence" | "falsifier" {
  if (evidenceKey === "physical-pressure") {
    return "confirming";
  }
  if (evidenceKey === "recognition-gap") {
    return contribution >= 0.55 ? "falsifier" : "confirming";
  }
  return contribution >= 0.5 ? "confirming" : "counterevidence";
}

function groupLabel(evidenceGroup: string): string {
  return evidenceLabelMap[evidenceGroup as keyof typeof evidenceLabelMap] ?? "transmission_pressure";
}

function toFreshnessKey(evidenceGroup: string): keyof LiveFreshnessSummary {
  return freshnessKeyMap[evidenceGroup as keyof typeof freshnessKeyMap] ?? "marketResponse";
}

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

  const freshness = parseSnapshotFreshness(snapshot.source_freshness_json);
  const evidenceRows = await getRunEvidenceBySnapshotRunKey(env, snapshot.run_key);
  const evidence = evidenceRows.map((row) => {
    const evidenceGroup = toFreshnessKey(row.evidence_group);
    const evidenceGroupLabel = groupLabel(row.evidence_group);
    const coverage = coverageForDimension(freshness[evidenceGroup]);
    const classification = row.evidence_classification ?? classifyEvidence(row.evidence_key, row.contribution);
    const parsedDetails = (() => {
      try {
        return JSON.parse(row.details_json) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();

    return {
      evidenceKey: row.evidence_key,
      evidenceGroup,
      evidenceGroupLabel,
      observedAt: row.observed_at,
      contribution: row.contribution,
      classification,
      coverage: row.coverage_quality ?? coverage,
      reason: `Derived from ${evidenceGroupLabel}.`,
      details: parsedDetails,
      evidence_key: row.evidence_key,
      evidence_group: row.evidence_group,
      evidence_group_label: evidenceGroupLabel,
      observed_at: row.observed_at,
      evidence_classification: classification,
      coverage_quality: row.coverage_quality ?? coverage,
      details_json: row.details_json
    };
  });

  return json({
    generatedAt: snapshot.generated_at,
    evidence,
    generated_at: snapshot.generated_at
  });
}
