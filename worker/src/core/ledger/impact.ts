import type { LedgerImpact, ScoringThresholds } from "../../types";

interface LedgerEntry {
  entryKey: string;
  impactDirection: "increase" | "decrease";
  createdAt: string;
  retiredAt: string | null;
  reviewDueAt: string;
}

interface LedgerImpactInput {
  mismatchScore: number;
  physicalStress: number;
  ledgerEntries: LedgerEntry[];
  nowIso: string;
  thresholds: ScoringThresholds;
}

function isLedgerEntryActive(entry: LedgerEntry, nowIso: string, staleThresholdDays: number): boolean {
  if (entry.retiredAt) {
    return false;
  }
  const reviewDueAt = new Date(entry.reviewDueAt).getTime();
  const now = new Date(nowIso).getTime();
  const daysSinceReview = (now - reviewDueAt) / (1000 * 60 * 60 * 24);
  return daysSinceReview <= staleThresholdDays;
}

export function applyLedgerAdjustments(input: LedgerImpactInput): {
  adjustedMismatchScore: number;
  ledgerImpact: LedgerImpact | null;
} {
  const activeEntries = input.ledgerEntries.filter((entry) =>
    isLedgerEntryActive(entry, input.nowIso, input.thresholds.ledgerStaleThresholdDays)
  );

  if (activeEntries.length === 0) {
    return {
      adjustedMismatchScore: input.mismatchScore,
      ledgerImpact: null
    };
  }

  let totalAdjustment = 0;
  let increaseCount = 0;
  let decreaseCount = 0;

  for (const entry of activeEntries) {
    if (entry.impactDirection === "increase") {
      totalAdjustment += input.thresholds.ledgerAdjustmentMagnitude;
      increaseCount++;
    } else {
      totalAdjustment -= input.thresholds.ledgerAdjustmentMagnitude;
      decreaseCount++;
    }
  }

  const adjustedScore = Math.max(0, Math.min(1, input.mismatchScore + totalAdjustment));
  const magnitudeApplied = Math.abs(totalAdjustment);

  const direction = totalAdjustment > 0 ? ("increase" as const) : totalAdjustment < 0 ? ("decrease" as const) : ("increase" as const);

  return {
    adjustedMismatchScore: adjustedScore,
    ledgerImpact: {
      direction,
      magnitude: magnitudeApplied,
      rationale: `${activeEntries.length} ledger entr${activeEntries.length !== 1 ? "ies" : "y"}: ${increaseCount} increase, ${decreaseCount} decrease`
    }
  };
}
