import type { EvidenceClassification, Subscores } from "../../types";

interface ClassificationInput {
  evidenceKey: string;
  contribution: number;
  physicalScore: number;
  recognitionScore: number;
  transmissionScore: number;
}

export function classifyEvidence(input: ClassificationInput): { classification: EvidenceClassification; reason: string } {
  const { evidenceKey, physicalScore, recognitionScore, transmissionScore } = input;

  // Confirming: evidence that supports dislocation thesis
  // - physical-pressure high: confirms physical deterioration
  // - recognition-gap large (recognition low): confirms market lag
  // - transmission-stress high: confirms price pressure is spreading

  // Counterevidence: evidence that weakens dislocation thesis
  // - physical-pressure low: contradicts deterioration claim
  // - recognition-gap small (recognition high): market is responding
  // - transmission-stress low: prices not reflecting stress

  // Falsifier: evidence that directly contradicts the thesis
  // - strong counterevidence combined with other signals

  let classification: EvidenceClassification = "confirming";
  let reason = "";

  if (evidenceKey === "physical-pressure") {
    if (physicalScore >= 0.6) {
      classification = "confirming";
      reason = "Strong physical deterioration supports dislocation thesis";
    } else if (physicalScore >= 0.4) {
      classification = "confirming";
      reason = "Moderate physical pressure supports emerging dislocation";
    } else {
      classification = "counterevidence";
      reason = "Weak physical pressure contradicts dislocation signal";
    }
  } else if (evidenceKey === "recognition-gap") {
    // Low recognition = high gap = confirming
    // High recognition = low gap = counterevidence
    if (recognitionScore <= 0.45) {
      classification = "confirming";
      reason = "Market recognition lags physical reality; confirms dislocation";
    } else if (recognitionScore <= 0.55) {
      classification = "counterevidence";
      reason = "Market recognition moderately responding to pressure";
    } else {
      classification = "falsifier";
      reason = "Market recognition is high; falsifies dislocation thesis if physical also high";
    }
  } else if (evidenceKey === "transmission-stress") {
    if (transmissionScore >= 0.6) {
      classification = "confirming";
      reason = "High transmission pressure validates physical-market mismatch";
    } else if (transmissionScore >= 0.4) {
      classification = "confirming";
      reason = "Moderate transmission pressure emerging";
    } else {
      classification = "counterevidence";
      reason = "Weak transmission pressure suggests market is processing stress";
    }
  }

  return { classification, reason };
}
