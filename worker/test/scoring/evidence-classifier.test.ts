import { describe, expect, it } from "vitest";
import { classifyEvidence } from "../../src/core/scoring/evidence-classifier";

describe("classifyEvidence", () => {
  it("classifies high physical pressure as confirming", () => {
    const result = classifyEvidence({
      evidenceKey: "physical-pressure",
      contribution: 0.75,
      physicalScore: 0.75,
      recognitionScore: 0.3,
      transmissionScore: 0.5,
    });

    expect(result.classification).toBe("confirming");
    expect(result.reason).toContain("physical deterioration");
  });

  it("classifies low physical pressure as counterevidence", () => {
    const result = classifyEvidence({
      evidenceKey: "physical-pressure",
      contribution: 0.2,
      physicalScore: 0.2,
      recognitionScore: 0.7,
      transmissionScore: 0.5,
    });

    expect(result.classification).toBe("counterevidence");
    expect(result.reason).toContain("contradicts");
  });

  it("classifies large recognition gap as confirming", () => {
    const result = classifyEvidence({
      evidenceKey: "recognition-gap",
      contribution: 0.7,
      physicalScore: 0.8,
      recognitionScore: 0.25,
      transmissionScore: 0.6,
    });

    expect(result.classification).toBe("confirming");
    expect(result.reason).toContain("lags");
  });

  it("classifies moderate recognition gap as counterevidence", () => {
    const result = classifyEvidence({
      evidenceKey: "recognition-gap",
      contribution: 0.3,
      physicalScore: 0.5,
      recognitionScore: 0.5,
      transmissionScore: 0.4,
    });

    expect(result.classification).toBe("counterevidence");
    expect(result.reason).toContain("responding");
  });

  it("classifies high recognition as falsifier", () => {
    const result = classifyEvidence({
      evidenceKey: "recognition-gap",
      contribution: 0.1,
      physicalScore: 0.8,
      recognitionScore: 0.85,
      transmissionScore: 0.3,
    });

    expect(result.classification).toBe("falsifier");
    expect(result.reason).toContain("falsifies");
  });

  it("classifies high transmission stress as confirming", () => {
    const result = classifyEvidence({
      evidenceKey: "transmission-stress",
      contribution: 0.75,
      physicalScore: 0.7,
      recognitionScore: 0.2,
      transmissionScore: 0.75,
    });

    expect(result.classification).toBe("confirming");
    expect(result.reason).toContain("validates");
  });

  it("classifies low transmission stress as counterevidence", () => {
    const result = classifyEvidence({
      evidenceKey: "transmission-stress",
      contribution: 0.2,
      physicalScore: 0.7,
      recognitionScore: 0.2,
      transmissionScore: 0.2,
    });

    expect(result.classification).toBe("counterevidence");
    expect(result.reason).toContain("processing");
  });
});
