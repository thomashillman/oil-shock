import type { DislocationState, Subscores, FreshnessSummary, ScoringThresholds } from "../../types";

interface StateContext {
  physicalScore: number;
  recognitionScore: number;
  transmissionScore: number;
  freshness: FreshnessSummary;
  durationInCurrentStateSeconds: number | null;
}

function secondsToHours(seconds: number | null): number | null {
  return seconds === null ? null : seconds / 3600;
}

export function computeDislocationState(
  mismatchScore: number,
  subscores: Subscores,
  freshness: FreshnessSummary,
  durationInCurrentStateSeconds: number | null,
  thresholds: ScoringThresholds
): { state: DislocationState; rationale: string } {
  const context: StateContext = {
    physicalScore: subscores.physical,
    recognitionScore: subscores.recognition,
    transmissionScore: subscores.transmission,
    freshness,
    durationInCurrentStateSeconds
  };

  const durationHours = secondsToHours(durationInCurrentStateSeconds);

  // Determine state based on score and confirmation gates
  let state: DislocationState = "aligned";
  let rationale = "";

  // Check for stale data; if critical data is stale, downgrade confidence
  const hasStaleCritical = freshness.physical === "stale" || freshness.recognition === "stale";

  // aligned: score < aligned_max AND physical pressure is low
  if (mismatchScore < thresholds.stateAlignedMax && context.physicalScore < 0.5) {
    state = "aligned";
    rationale = "Physical pressure is modest; market recognition aligned.";
  }
  // deep_divergence: score >= deep_min AND >= 2 confirmations AND persisted 5+ days
  else if (
    mismatchScore >= thresholds.stateDeepMin &&
    context.physicalScore >= 0.6 &&
    context.recognitionScore <= 0.45 &&
    context.transmissionScore >= 0.5 &&
    (!durationHours || durationHours >= 120) // 5 days = 120 hours
  ) {
    state = "deep_divergence";
    if (context.transmissionScore >= 0.7) {
      rationale = "Physical deterioration severe; market recognition significantly lags; transmission signals accelerating. Persistent state now deep.";
    } else {
      rationale = "Physical deterioration sustained; market recognition lags; transmission pressure building. Persistent state now deep.";
    }
  }
  // persistent_divergence: score persistent_min–persistent_max AND persisted dislocationPersistenceHours+
  else if (
    mismatchScore >= thresholds.statePersistentMin &&
    mismatchScore < thresholds.statePersistentMax &&
    context.physicalScore >= 0.6 &&
    context.recognitionScore <= 0.45 &&
    (!durationHours || durationHours >= thresholds.dislocationPersistenceHours)
  ) {
    state = "persistent_divergence";
    rationale = "Physical pressure persists while market recognition lags; transmission signals emerging. Divergence now sustained.";
  }
  // mild_divergence: score mild_min–persistent_min
  else if (mismatchScore >= thresholds.stateMildMin && mismatchScore < thresholds.statePersistentMin) {
    state = "mild_divergence";
    if (context.transmissionScore >= 0.6) {
      rationale = "Physical pressure emerging; market recognition beginning to respond; transmission signals rising.";
    } else {
      rationale = "Physical pressure emerging; market recognition lagging; early transmission signals.";
    }
  }
  // catch-all for score-driven transitions
  else if (mismatchScore >= thresholds.statePersistentMin) {
    state = "persistent_divergence";
    rationale = "Score-driven persistent state: physical elevated, recognition lagging, transmission mixed.";
  }

  // Downgrade confidence if stale
  if (hasStaleCritical) {
    state = "aligned"; // Conservative: revert to aligned if critical data is stale
    rationale = `${rationale} [STALE DATA: confidence downgraded]`;
  }

  return { state, rationale };
}
