export type Tab = "dashboard" | "rules" | "backfill";
export type SortKey = "generatedAt" | "delta";

export interface RuleSummary {
  ruleKey: string;
  name: string;
  weight: number;
  predicate: unknown;
}

export interface BackfillRow {
  generatedAt: string;
  baselineScore: number;
  rescoredWithOverride: number;
}

export type MetricKey = "physicalStress" | "priceSignal" | "marketResponse";
export type PredicateOperator = ">=" | ">" | "<=" | "<";
