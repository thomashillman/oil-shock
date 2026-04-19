import type { DislocationState, Subscores, FreshnessSummary, ScoringThresholds } from "../../types";

interface StateContext {
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
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
    physicalStress: subscores.physicalStress,
    priceSignal: subscores.priceSignal,
    marketResponse: subscores.marketResponse,
    freshness,
    durationInCurrentStateSeconds
  };

  const durationHours = secondsToHours(durationInCurrentStateSeconds);

  let state: DislocationState = "aligned";
  let rationale = "";

  const hasStaleCritical = freshness.physicalStress === "stale" || freshness.priceSignal === "stale";

  // aligned: score < aligned_max AND physical stress is low
  if (mismatchScore < thresholds.stateAlignedMax && context.physicalStress < 0.5) {
    state = "aligned";
    rationale = "Physical pressure is modest; market recognition aligned.";
  }
  // deep_divergence: score >= deep_min AND all confirmations met AND persisted stateDeepPersistenceHours+
  else if (
    mismatchScore >= thresholds.stateDeepMin &&
    context.physicalStress >= thresholds.confirmationPhysicalStressMin &&
    context.priceSignal <= thresholds.confirmationPriceSignalMax &&
    context.marketResponse >= thresholds.confirmationMarketResponseMin &&
    durationHours !== null && durationHours >= thresholds.stateDeepPersistenceHours
  ) {
    state = "deep_divergence";
    if (context.marketResponse >= 0.7) {
      rationale = "Physical deterioration severe; market recognition significantly lags; transmission signals accelerating. Persistent state now deep.";
    } else {
      rationale = "Physical deterioration sustained; market recognition lags; transmission pressure building. Persistent state now deep.";
    }
  }
  // persistent_divergence: score persistent_min–persistent_max AND all confirmations met AND persisted statePersistentPersistenceHours+
  else if (
    mismatchScore >= thresholds.statePersistentMin &&
    mismatchScore < thresholds.statePersistentMax &&
    context.physicalStress >= thresholds.confirmationPhysicalStressMin &&
    context.priceSignal <= thresholds.confirmationPriceSignalMax &&
    durationHours !== null && durationHours >= thresholds.statePersistentPersistenceHours
  ) {
    state = "persistent_divergence";
    rationale = "Physical pressure persists while market recognition lags; transmission signals emerging. Divergence now sustained.";
  }
  // mild_divergence: score mild_min–persistent_min
  else if (mismatchScore >= thresholds.stateMildMin && mismatchScore < thresholds.statePersistentMin) {
    state = "mild_divergence";
    if (context.marketResponse >= 0.6) {
      rationale = "Physical pressure emerging; market recognition beginning to respond; transmission signals rising.";
    } else {
      rationale = "Physical pressure emerging; market recognition lagging; early transmission signals.";
    }
  }
  // catch-all for score-driven transitions not yet meeting duration gates
  else if (mismatchScore >= thresholds.statePersistentMin) {
    state = "mild_divergence";
    rationale = "Score elevated but duration gate not yet met; classified as mild pending persistence.";
  }

  // Conservative downgrade: revert to aligned if critical data is stale
  if (hasStaleCritical) {
    state = "aligned";
    rationale = `${rationale} [STALE DATA: confidence downgraded]`;
  }

  return { state, rationale };
}
