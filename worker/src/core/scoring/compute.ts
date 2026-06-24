import type { ActionabilityState, FreshnessSummary, ScoreEvidence, StateSnapshot, Confidence, Subscores, ScoringThresholds } from "../../types";

interface ScoreInputs {
  nowIso: string;
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
  physicalStressObservedAt: string | null;
  priceSignalObservedAt: string | null;
  marketResponseObservedAt: string | null;
  freshness: FreshnessSummary;
  thresholds: ScoringThresholds;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function computeSnapshot(inputs: ScoreInputs): { snapshot: StateSnapshot; evidence: ScoreEvidence[] } {
  const { physicalStress, priceSignal, marketResponse, thresholds } = inputs;

  const mismatchScore = clamp(physicalStress - priceSignal + marketResponse * thresholds.mismatchMarketResponseWeight);

  const confirmations = [
    physicalStress >= thresholds.confirmationPhysicalStressMin && inputs.freshness.physicalStress === "fresh",
    priceSignal <= thresholds.confirmationPriceSignalMax && inputs.freshness.priceSignal === "fresh",
    marketResponse >= thresholds.confirmationMarketResponseMin && inputs.freshness.marketResponse === "fresh"
  ].filter(Boolean).length;

  let actionabilityState: ActionabilityState = "none";
  if (mismatchScore >= 0.4) {
    actionabilityState = "watch";
  }
  if (mismatchScore >= 0.65 && confirmations >= 2) {
    actionabilityState = "actionable";
  }

  const freshnessValues = Object.values(inputs.freshness);
  const missingCount = freshnessValues.filter((value) => value === "missing").length;
  const staleCount = freshnessValues.filter((value) => value === "stale").length;
  const coverageConfidence = clamp(1 - missingCount * thresholds.coverageMissingPenalty - staleCount * thresholds.coverageStalePenalty);

  const sourceQuality = {
    physicalStress: inputs.freshness.physicalStress,
    priceSignal: inputs.freshness.priceSignal,
    marketResponse: inputs.freshness.marketResponse
  };

  const evidence: ScoreEvidence[] = [
    {
      evidenceKey: "physical-pressure",
      evidenceGroup: "physicalStress",
      evidenceGroupLabel: "physical_stress_indicator",
      observedAt: inputs.physicalStressObservedAt ?? inputs.nowIso,
      contribution: physicalStress,
      classification: "confirming",
      coverage: inputs.freshness.physicalStress === "fresh" ? "well" : inputs.freshness.physicalStress === "stale" ? "weakly" : "not_covered",
      reason: `Physical stress indicator at ${(physicalStress * 100).toFixed(0)}% (${inputs.freshness.physicalStress})`,
      details: { feature: "physical_stress", freshness: inputs.freshness.physicalStress }
    },
    {
      evidenceKey: "recognition-gap",
      evidenceGroup: "priceSignal",
      evidenceGroupLabel: "price_signal_pressure",
      observedAt: inputs.priceSignalObservedAt ?? inputs.nowIso,
      contribution: 1 - priceSignal,
      classification: priceSignal < thresholds.confirmationPriceSignalMax ? "confirming" : "counterevidence",
      coverage: inputs.freshness.priceSignal === "fresh" ? "well" : inputs.freshness.priceSignal === "stale" ? "weakly" : "not_covered",
      reason: `Price signal at ${(priceSignal * 100).toFixed(0)}% (${inputs.freshness.priceSignal}) - ${priceSignal < thresholds.confirmationPriceSignalMax ? "lags physical stress" : "acknowledges pressure"}`,
      details: { feature: "price_signal_inverse", freshness: inputs.freshness.priceSignal }
    },
    {
      evidenceKey: "transmission-stress",
      evidenceGroup: "marketResponse",
      evidenceGroupLabel: "market_response_pressure",
      observedAt: inputs.marketResponseObservedAt ?? inputs.nowIso,
      contribution: marketResponse,
      classification: marketResponse >= thresholds.confirmationMarketResponseMin ? "confirming" : "counterevidence",
      coverage: inputs.freshness.marketResponse === "fresh" ? "well" : inputs.freshness.marketResponse === "stale" ? "weakly" : "not_covered",
      reason: `Market response at ${(marketResponse * 100).toFixed(0)}% (${inputs.freshness.marketResponse}) - ${marketResponse >= thresholds.confirmationMarketResponseMin ? "validates price pressure" : "mismatch with physical"}`,
      details: { feature: "market_response_stress", freshness: inputs.freshness.marketResponse }
    }
  ];

  const subscores: Subscores = {
    physicalStress,
    priceSignal,
    marketResponse
  };

  const confidence: Confidence = {
    coverage: coverageConfidence,
    sourceQuality
  };

  return {
    snapshot: {
      generatedAt: inputs.nowIso,
      mismatchScore,
      dislocationState: "aligned",
      stateRationale: "State determination pending state-labels engine.",
      actionabilityState,
      confidence,
      subscores,
      clocks: {
        shock: { ageSeconds: 0, label: "unknown", classification: "acute" },
        dislocation: { ageSeconds: 0, label: "unknown", classification: "acute" },
        transmission: { ageSeconds: 0, label: "unknown", classification: "acute" }
      },
      ledgerImpact: null,
      coverageConfidence,
      sourceFreshness: inputs.freshness,
      evidenceIds: evidence.map((item) => item.evidenceKey),
      guardrailFlags: []
    },
    evidence
  };
}
