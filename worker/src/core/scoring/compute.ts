import type { ActionabilityState, FreshnessSummary, ScoreEvidence, StateSnapshot } from "../../types";

interface ScoreInputs {
  nowIso: string;
  physicalPressure: number;
  recognition: number;
  transmission: number;
  physicalObservedAt: string | null;
  recognitionObservedAt: string | null;
  transmissionObservedAt: string | null;
  freshness: FreshnessSummary;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function computeSnapshot(inputs: ScoreInputs): { snapshot: StateSnapshot; evidence: ScoreEvidence[] } {
  const mismatchScore = clamp(inputs.physicalPressure - inputs.recognition + inputs.transmission * 0.15);
  const confirmations = [
    inputs.physicalPressure >= 0.6 && inputs.freshness.physical === "fresh",
    inputs.recognition <= 0.45 && inputs.freshness.recognition === "fresh",
    inputs.transmission >= 0.5 && inputs.freshness.transmission === "fresh"
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
  const coverageConfidence = clamp(1 - missingCount * 0.34 - staleCount * 0.16);

  const evidence: ScoreEvidence[] = [
    {
      evidenceKey: "physical-pressure",
      evidenceGroup: "physical",
      observedAt: inputs.physicalObservedAt ?? inputs.nowIso,
      contribution: inputs.physicalPressure,
      details: { feature: "physical_pressure", freshness: inputs.freshness.physical }
    },
    {
      evidenceKey: "recognition-gap",
      evidenceGroup: "recognition",
      observedAt: inputs.recognitionObservedAt ?? inputs.nowIso,
      contribution: 1 - inputs.recognition,
      details: { feature: "market_recognition_inverse", freshness: inputs.freshness.recognition }
    },
    {
      evidenceKey: "transmission-stress",
      evidenceGroup: "transmission",
      observedAt: inputs.transmissionObservedAt ?? inputs.nowIso,
      contribution: inputs.transmission,
      details: { feature: "transmission_stress", freshness: inputs.freshness.transmission }
    }
  ];

  return {
    snapshot: {
      generatedAt: inputs.nowIso,
      mismatchScore,
      actionabilityState,
      coverageConfidence,
      sourceFreshness: inputs.freshness,
      evidenceIds: evidence.map((item) => item.evidenceKey)
    },
    evidence
  };
}
