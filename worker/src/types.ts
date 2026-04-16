export type ActionabilityState = "none" | "watch" | "actionable";

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
  evidenceGroup: "physical" | "recognition" | "transmission";
  observedAt: string;
  contribution: number;
  details: Record<string, unknown>;
}

export interface StateSnapshot {
  generatedAt: string;
  mismatchScore: number;
  actionabilityState: ActionabilityState;
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
