export type ActionabilityState = "none" | "watch" | "actionable";
export type DislocationState = "aligned" | "mild_divergence" | "persistent_divergence" | "deep_divergence";

export type EvidenceClassification = "confirming" | "counterevidence" | "falsifier";
export type CoverageQuality = "well" | "weakly" | "not_covered";
export type EvidenceGroup = "physicalStress" | "priceSignal" | "marketResponse";

export interface LiveFreshnessSummary {
  physicalStress: "fresh" | "stale" | "missing";
  priceSignal: "fresh" | "stale" | "missing";
  marketResponse: "fresh" | "stale" | "missing";
}

export interface Clock {
  ageSeconds: number;
  label: string;
  classification: "acute" | "emerging" | "chronic";
}

export interface Confidence {
  coverage: number;
  sourceQuality: LiveFreshnessSummary;
}

export interface Subscores {
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
}

export interface LedgerImpact {
  direction: "increase" | "decrease";
  magnitude: number;
  rationale: string;
}

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

export interface ScoreEvidence {
  evidenceKey: string;
  evidenceGroup: EvidenceGroup;
  evidenceGroupLabel: string;
  observedAt: string;
  contribution: number;
  classification: EvidenceClassification;
  coverage: CoverageQuality;
  reason: string;
  details: Record<string, unknown>;
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
  sourceFreshness: LiveFreshnessSummary;
  evidenceIds: string[];
  guardrailFlags: string[];
}

export interface LedgerEntryInput {
  key: string;
  rationale: string;
  impactDirection: "increase" | "decrease";
  reviewDueAt: string;
}
