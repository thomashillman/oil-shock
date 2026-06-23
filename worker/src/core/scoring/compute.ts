import type {
  ActionabilityState,
  Clock,
  FreshnessSummary,
  LiveFreshnessSummary,
  ScoreEvidence,
  StateSnapshot
} from "../../types";
import { buildStateRationale } from "../freshness/summary";

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

function toLiveFreshness(freshness: FreshnessSummary): LiveFreshnessSummary {
  return {
    physicalStress: freshness.physical,
    priceSignal: freshness.recognition,
    marketResponse: freshness.transmission
  };
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

function classifyAge(ageSeconds: number): Clock["classification"] {
  if (ageSeconds < 24 * 60 * 60) {
    return "acute";
  }
  if (ageSeconds < 7 * 24 * 60 * 60) {
    return "emerging";
  }
  return "chronic";
}

function buildClock(nowIso: string, observedAt: string | null): Clock {
  if (!observedAt) {
    return { ageSeconds: 0, label: "none yet", classification: "acute" };
  }

  const observed = new Date(observedAt);
  const now = new Date(nowIso);
  const ageSeconds = Math.max(0, Math.round((now.getTime() - observed.getTime()) / 1000));
  return {
    ageSeconds,
    label: formatAgeLabel(ageSeconds),
    classification: classifyAge(ageSeconds)
  };
}

function deriveDislocationState(mismatchScore: number): StateSnapshot["dislocationState"] {
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
  const liveFreshness = toLiveFreshness(inputs.freshness);
  const dislocationState = deriveDislocationState(mismatchScore);

  const evidence: ScoreEvidence[] = [
    {
      evidenceKey: "physical-pressure",
      evidenceGroup: "physicalStress",
      evidenceGroupLabel: "physical_reality",
      observedAt: inputs.physicalObservedAt ?? inputs.nowIso,
      contribution: inputs.physicalPressure,
      classification: "confirming",
      coverage: inputs.freshness.physical === "fresh" ? "well" : inputs.freshness.physical === "stale" ? "weakly" : "not_covered",
      reason: `Physical stress indicator at ${(inputs.physicalPressure * 100).toFixed(0)}% (${inputs.freshness.physical})`,
      details: { feature: "physical_pressure", freshness: inputs.freshness.physical }
    },
    {
      evidenceKey: "recognition-gap",
      evidenceGroup: "priceSignal",
      evidenceGroupLabel: "market_recognition",
      observedAt: inputs.recognitionObservedAt ?? inputs.nowIso,
      contribution: 1 - inputs.recognition,
      classification: inputs.recognition <= 0.45 ? "confirming" : "falsifier",
      coverage: inputs.freshness.recognition === "fresh" ? "well" : inputs.freshness.recognition === "stale" ? "weakly" : "not_covered",
      reason: `Price signal at ${(inputs.recognition * 100).toFixed(0)}% (${inputs.freshness.recognition}) - ${inputs.recognition <= 0.45 ? "lags physical stress" : "acknowledges pressure"}`,
      details: { feature: "market_recognition_inverse", freshness: inputs.freshness.recognition }
    },
    {
      evidenceKey: "transmission-stress",
      evidenceGroup: "marketResponse",
      evidenceGroupLabel: "transmission_pressure",
      observedAt: inputs.transmissionObservedAt ?? inputs.nowIso,
      contribution: inputs.transmission,
      classification: inputs.transmission >= 0.5 ? "confirming" : "counterevidence",
      coverage: inputs.freshness.transmission === "fresh" ? "well" : inputs.freshness.transmission === "stale" ? "weakly" : "not_covered",
      reason: `Market response at ${(inputs.transmission * 100).toFixed(0)}% (${inputs.freshness.transmission}) - ${inputs.transmission >= 0.5 ? "validates price pressure" : "mismatch with physical"}`,
      details: { feature: "transmission_stress", freshness: inputs.freshness.transmission }
    }
  ];

  return {
    snapshot: {
      generatedAt: inputs.nowIso,
      mismatchScore,
      dislocationState,
      stateRationale: buildStateRationale(dislocationState, staleCount),
      actionabilityState,
      confidence: {
        coverage: coverageConfidence,
        sourceQuality: liveFreshness
      },
      subscores: {
        physicalStress: inputs.physicalPressure,
        priceSignal: inputs.recognition,
        marketResponse: inputs.transmission
      },
      clocks: {
        shock: buildClock(inputs.nowIso, inputs.physicalObservedAt),
        dislocation: buildClock(inputs.nowIso, inputs.recognitionObservedAt),
        transmission: buildClock(inputs.nowIso, inputs.transmissionObservedAt)
      },
      ledgerImpact: null,
      coverageConfidence,
      sourceFreshness: liveFreshness,
      evidenceIds: evidence.map((item) => item.evidenceKey),
      guardrailFlags: [
        inputs.freshness.physical === "fresh" ? null : `physical-${inputs.freshness.physical}`,
        inputs.freshness.recognition === "fresh" ? null : `price-${inputs.freshness.recognition}`,
        inputs.freshness.transmission === "fresh" ? null : `market-${inputs.freshness.transmission}`
      ].filter((flag): flag is string => flag !== null)
    },
    evidence
  };
}
