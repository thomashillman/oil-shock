export type ActionabilityState = "none" | "watch" | "actionable";
export type DislocationState = "aligned" | "mild_divergence" | "persistent_divergence" | "deep_divergence";
export type EvidenceClassification = "confirming" | "counterevidence" | "falsifier";
export type CoverageQuality = "well" | "weakly" | "not_covered";
export type EvidenceGroupLabel = "physical_reality" | "market_recognition" | "transmission_pressure";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface NormalizedPoint {
  seriesKey: string;
  observedAt: string;
  value: number;
  unit: string;
  sourceKey: string;
}

export interface FreshnessSummary {
  physical: "fresh" | "stale" | "missing";
  recognition: "fresh" | "stale" | "missing";
  transmission: "fresh" | "stale" | "missing";
}

export interface Clock {
  ageSeconds: number;
  label: string;
  classification: "acute" | "chronic" | "emerging";
}

export interface StateChangeEvent {
  generatedAt: string;
  previousState: DislocationState | null;
  newState: DislocationState;
  stateDurationSeconds: number | null;
  transmissionChanged: boolean;
}

export interface ScoreEvidence {
  evidenceKey: string;
  evidenceGroup: "physical" | "recognition" | "transmission";
  evidenceGroupLabel: EvidenceGroupLabel;
  observedAt: string;
  contribution: number;
  classification: EvidenceClassification;
  coverage: CoverageQuality;
  reason: string;
  details: Record<string, unknown>;
}

export interface LedgerImpact {
  direction: "increase" | "decrease";
  magnitude: number;
  rationale: string;
}

export interface Confidence {
  coverage: number;
  sourceQuality: Record<string, unknown>;
}

export interface Subscores {
  physical: number;
  recognition: number;
  transmission: number;
}

export interface StateSnapshot {
  generatedAt: string;
  mismatchScore: number;
  dislocationState: DislocationState;
  stateRationale: string;
  actionabilityState: ActionabilityState;
  confidence: Confidence;
  subscores: Subscores;
  clocks: {
    shock: Clock;
    dislocation: Clock;
    transmission: Clock;
  };
  ledgerImpact: LedgerImpact | null;
  coverageConfidence: number;
  sourceFreshness: FreshnessSummary;
  evidenceIds: string[];
}

export interface LedgerEntryInput {
  key: string;
  rationale: string;
  impactDirection: "increase" | "decrease";
  reviewDueAt: string;
}

export interface ScoringThresholds {
  stateAlignedMax: number;
  stateMildMin: number;
  stateMildMax: number;
  statePersistentMin: number;
  statePersistentMax: number;
  stateDeepMin: number;
  shockAgeThresholdHours: number;
  dislocationPersistenceHours: number;
  ledgerAdjustmentMagnitude: number;
}
