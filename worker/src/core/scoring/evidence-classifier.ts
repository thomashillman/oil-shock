import type { EvidenceClassification } from "../../types";

interface ClassificationInput {
  evidenceKey: string;
  contribution: number;
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
}

export function classifyEvidence(input: ClassificationInput): { classification: EvidenceClassification; reason: string } {
  const { evidenceKey, physicalStress, priceSignal, marketResponse } = input;

  let classification: EvidenceClassification = "confirming";
  let reason = "";

  if (evidenceKey === "physical-pressure") {
    if (physicalStress >= 0.6) {
      classification = "confirming";
      reason = "Strong physical deterioration supports dislocation thesis";
    } else if (physicalStress >= 0.4) {
      classification = "confirming";
      reason = "Moderate physical pressure supports emerging dislocation";
    } else {
      classification = "counterevidence";
      reason = "Weak physical pressure contradicts dislocation signal";
    }
  } else if (evidenceKey === "recognition-gap") {
    if (priceSignal <= 0.45) {
      classification = "confirming";
      reason = "Price signal lags physical reality; confirms dislocation";
    } else if (priceSignal <= 0.55) {
      classification = "counterevidence";
      reason = "Price signal moderately responding to pressure";
    } else {
      classification = "falsifier";
      reason = "Price signal is high; falsifies dislocation thesis if physical also high";
    }
  } else if (evidenceKey === "transmission-stress") {
    if (marketResponse >= 0.6) {
      classification = "confirming";
      reason = "High market response validates physical-market mismatch";
    } else if (marketResponse >= 0.4) {
      classification = "confirming";
      reason = "Moderate market response emerging";
    } else {
      classification = "counterevidence";
      reason = "Weak market response suggests market is processing stress";
    }
  }

  return { classification, reason };
}
