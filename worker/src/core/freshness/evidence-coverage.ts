import type { CoverageQuality } from "../../types";

interface CoverageEvaluationInput {
  evidenceKey: string;
  freshness: "fresh" | "stale" | "missing";
}

export function evaluateEvidenceCoverage(input: CoverageEvaluationInput): { coverage: CoverageQuality; reason: string } {
  const { freshness } = input;

  let coverage: CoverageQuality = "well";
  let reason = "";

  if (freshness === "fresh") {
    coverage = "well";
    reason = "Data source current and reliable";
  } else if (freshness === "stale") {
    coverage = "weakly";
    reason = "Data source is stale; credibility reduced";
  } else if (freshness === "missing") {
    coverage = "not_covered";
    reason = "No data available for this signal";
  }

  return { coverage, reason };
}
