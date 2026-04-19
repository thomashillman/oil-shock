import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import { handleGetEvidence } from "../../src/routes/evidence";
import { startRun, writeRunEvidence, writeSnapshot } from "../../src/db/client";
import type { ScoreEvidence, StateSnapshot } from "../../src/types";
import { createTestEnv } from "../helpers/fake-d1";

function sampleSnapshot(generatedAt: string): StateSnapshot {
  return {
    generatedAt,
    mismatchScore: 0.42,
    dislocationState: "mild_divergence",
    stateRationale: "Physical pressure persists while market recognition lags.",
    actionabilityState: "watch",
    confidence: { coverage: 0.85, sourceQuality: {} },
    subscores: { physicalStress: 0.7, priceSignal: 0.3, marketResponse: 0.55 },
    clocks: {
      shock: { ageSeconds: 3600, label: "1 hour", classification: "acute" },
      dislocation: { ageSeconds: 7200, label: "2 hours", classification: "acute" },
      transmission: { ageSeconds: 1800, label: "30 minutes", classification: "emerging" }
    },
    ledgerImpact: null,
    coverageConfidence: 0.85,
    sourceFreshness: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "stale" },
    evidenceIds: ["physical-pressure"]
  };
}

function evidenceItem(evidenceKey: string): ScoreEvidence {
  return {
    evidenceKey,
    evidenceGroup: "physicalStress",
    evidenceGroupLabel: "physical_stress_indicator",
    observedAt: "2026-04-16T00:00:00.000Z",
    contribution: 0.7,
    classification: "confirming",
    coverage: "well",
    reason: "test",
    details: {}
  };
}

describe("GET /api/evidence", () => {
  it("uses the latest snapshot run_key to fetch evidence", async () => {
    const env = createTestEnv() as unknown as Env;

    await startRun(env, "score-1", "score");
    await writeRunEvidence(env, "score-1", [evidenceItem("snapshot-linked-evidence")]);
    await startRun(env, "score-2", "score");
    await writeRunEvidence(env, "score-2", [evidenceItem("latest-run-evidence")]);

    await writeSnapshot(env, sampleSnapshot("2026-04-17T00:00:00.000Z"), "score-1");

    const response = await handleGetEvidence(env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { evidence: Array<{ evidenceKey: string }> };
    expect(payload.evidence.map((row) => row.evidenceKey)).toEqual(["snapshot-linked-evidence"]);
  });

  it("falls back to latest score run when snapshot run_key is null", async () => {
    const env = createTestEnv() as unknown as Env;

    await startRun(env, "score-1", "score");
    await writeRunEvidence(env, "score-1", [evidenceItem("legacy-fallback-evidence")]);
    await writeSnapshot(env, sampleSnapshot("2026-04-18T00:00:00.000Z"));

    const response = await handleGetEvidence(env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { evidence: Array<{ evidenceKey: string }> };
    expect(payload.evidence.map((row) => row.evidenceKey)).toEqual(["legacy-fallback-evidence"]);
  });
});
