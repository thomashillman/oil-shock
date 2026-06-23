import type { Env } from "../env";
import { getLatestSeriesValue, getLatestSnapshot } from "../db/client";
import {
  buildStateRationale,
  countStaleFreshness,
  parseSnapshotFreshness,
  toLegacyFreshness
} from "../core/freshness/summary";
import { json } from "../lib/http";
import type { DislocationState } from "../types";

function deriveDislocationState(mismatchScore: number): "aligned" | "mild_divergence" | "persistent_divergence" | "deep_divergence" {
  if (mismatchScore < 0.25) {
    return "aligned";
  }
  if (mismatchScore < 0.45) {
    return "mild_divergence";
  }
  if (mismatchScore < 0.7) {
    return "persistent_divergence";
  }
  return "deep_divergence";
}

function formatAgeLabel(ageSeconds: number): string {
  if (!Number.isFinite(ageSeconds) || ageSeconds <= 0) {
    return "none yet";
  }

  const minutes = Math.round(ageSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }

  const days = Math.round(hours / 24);
  return `${days}d`;
}

function buildClock(nowIso: string, observedAt: string | null) {
  if (!observedAt) {
    return { ageSeconds: 0, label: "none yet", classification: "acute" as const };
  }

  const ageSeconds = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(observedAt).getTime()) / 1000));
  return {
    ageSeconds,
    label: formatAgeLabel(ageSeconds),
    classification: (ageSeconds < 24 * 60 * 60 ? "acute" : ageSeconds < 7 * 24 * 60 * 60 ? "emerging" : "chronic") as
      | "acute"
      | "emerging"
      | "chronic"
  };
}

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

  const freshness = parseSnapshotFreshness(snapshot.source_freshness_json);
  const dislocationState: DislocationState = snapshot.dislocation_state_json
    ? (JSON.parse(snapshot.dislocation_state_json) as DislocationState)
    : deriveDislocationState(snapshot.mismatch_score);
  const staleCount = countStaleFreshness(freshness);
  const nowIso = snapshot.generated_at;
  const [physical, utilization, recognition, crack, impairments] = await Promise.all([
    getLatestSeriesValue(env, "physical.inventory_draw"),
    getLatestSeriesValue(env, "physical.utilization"),
    getLatestSeriesValue(env, "recognition.curve_signal"),
    getLatestSeriesValue(env, "transmission.crack_signal"),
    getLatestSeriesValue(env, "transmission.impairment_mentions")
  ]);

  const physicalObservedAt = physical?.observedAt ?? utilization?.observedAt ?? null;
  const recognitionObservedAt = recognition?.observedAt ?? null;
  const transmissionObservedAt = crack?.observedAt ?? impairments?.observedAt ?? null;

  const clocks = snapshot.clocks_json
    ? JSON.parse(snapshot.clocks_json)
    : {
        shock: buildClock(nowIso, physicalObservedAt),
        dislocation: buildClock(nowIso, recognitionObservedAt),
        transmission: buildClock(nowIso, transmissionObservedAt)
      };

  const subscores = snapshot.subscores_json
    ? JSON.parse(snapshot.subscores_json)
    : {
        physicalStress: Math.max(0, Math.min(1, ((physical?.value ?? 0) + (utilization?.value ?? 0)) / (utilization ? 2 : 1))),
        priceSignal: Math.max(0, Math.min(1, recognition?.value ?? 0)),
        marketResponse: Math.max(0, Math.min(1, ((crack?.value ?? 0) + (impairments?.value ?? 0)) / (impairments ? 2 : 1)))
      };

  const confidence = snapshot.coverage_confidence;
  const payload = {
    generatedAt: snapshot.generated_at,
    mismatchScore: snapshot.mismatch_score,
    dislocationState,
    stateRationale: snapshot.state_rationale ?? buildStateRationale(dislocationState, staleCount),
    actionabilityState: snapshot.actionability_state,
    confidence: {
      coverage: confidence,
      sourceQuality: freshness
    },
    subscores,
    clocks,
    ledgerImpact: snapshot.ledger_impact_json ? JSON.parse(snapshot.ledger_impact_json) : null,
    coverageConfidence: snapshot.coverage_confidence,
    sourceFreshness: freshness,
    evidenceIds: snapshot.evidence_ids_json ? (JSON.parse(snapshot.evidence_ids_json) as string[]) : [],
    guardrailFlags: snapshot.guardrail_flags_json ? (JSON.parse(snapshot.guardrail_flags_json) as string[]) : []
  };

  return json({
    ...payload,
    generated_at: snapshot.generated_at,
    mismatch_score: snapshot.mismatch_score,
    dislocation_state: dislocationState,
    state_rationale: payload.stateRationale,
    actionability_state: snapshot.actionability_state,
    coverage_confidence: snapshot.coverage_confidence,
    source_freshness: toLegacyFreshness(freshness),
    evidence_ids: payload.evidenceIds
  });
}
