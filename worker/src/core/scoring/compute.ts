import type { ActionabilityState, FreshnessSummary, ScoreEvidence, StateSnapshot, Confidence, Subscores } from "../../types";

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
  // Compute subscores: physical, recognition, and transmission
  const physicalScore = inputs.physicalPressure;
  const recognitionScore = inputs.recognition;
  const transmissionScore = inputs.transmission;

  // Mismatch score uses transmission at 0.15 weight
  const mismatchScore = clamp(physicalScore - recognitionScore + transmissionScore * 0.15);

  // Count confirmations based on strength + freshness
  const confirmations = [
    physicalScore >= 0.6 && inputs.freshness.physical === "fresh",
    recognitionScore <= 0.45 && inputs.freshness.recognition === "fresh",
    transmissionScore >= 0.5 && inputs.freshness.transmission === "fresh"
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

  // Build source quality metadata
  const sourceQuality = {
    physical: inputs.freshness.physical,
    recognition: inputs.freshness.recognition,
    transmission: inputs.freshness.transmission
  };

  const evidence: ScoreEvidence[] = [
    {
      evidenceKey: "physical-pressure",
      evidenceGroup: "physical",
      evidenceGroupLabel: "physical_reality",
      observedAt: inputs.physicalObservedAt ?? inputs.nowIso,
      contribution: physicalScore,
      classification: "confirming",
      coverage: inputs.freshness.physical === "fresh" ? "well" : inputs.freshness.physical === "stale" ? "weakly" : "not_covered",
      reason: `Physical pressure indicator at ${(physicalScore * 100).toFixed(0)}% (${inputs.freshness.physical})`,
      details: { feature: "physical_pressure", freshness: inputs.freshness.physical }
    },
    {
      evidenceKey: "recognition-gap",
      evidenceGroup: "recognition",
      evidenceGroupLabel: "market_recognition",
      observedAt: inputs.recognitionObservedAt ?? inputs.nowIso,
      contribution: 1 - recognitionScore,
      classification: recognitionScore < 0.45 ? "confirming" : "counterevidence",
      coverage: inputs.freshness.recognition === "fresh" ? "well" : inputs.freshness.recognition === "stale" ? "weakly" : "not_covered",
      reason: `Market recognition at ${(recognitionScore * 100).toFixed(0)}% (${inputs.freshness.recognition}) - ${recognitionScore < 0.45 ? "lags physical pressure" : "acknowledges pressure"}`,
      details: { feature: "market_recognition_inverse", freshness: inputs.freshness.recognition }
    },
    {
      evidenceKey: "transmission-stress",
      evidenceGroup: "transmission",
      evidenceGroupLabel: "transmission_pressure",
      observedAt: inputs.transmissionObservedAt ?? inputs.nowIso,
      contribution: transmissionScore,
      classification: transmissionScore >= 0.5 ? "confirming" : "counterevidence",
      coverage: inputs.freshness.transmission === "fresh" ? "well" : inputs.freshness.transmission === "stale" ? "weakly" : "not_covered",
      reason: `Transmission pressure at ${(transmissionScore * 100).toFixed(0)}% (${inputs.freshness.transmission}) - ${transmissionScore >= 0.5 ? "validates price pressure" : "mismatch with physical"}`,
      details: { feature: "transmission_stress", freshness: inputs.freshness.transmission }
    }
  ];

  const subscores: Subscores = {
    physical: physicalScore,
    recognition: recognitionScore,
    transmission: transmissionScore
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
      evidenceIds: evidence.map((item) => item.evidenceKey)
    },
    evidence
  };
}
