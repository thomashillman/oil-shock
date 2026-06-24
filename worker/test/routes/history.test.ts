import { describe, expect, it } from "vitest";
import worker from "../../src";
import type { Env } from "../../src/env";
import { writeSnapshot } from "../../src/db/client";
import type { StateSnapshot } from "../../src/types";
import { createExecutionContext, createTestEnv } from "../helpers/fake-d1";

function sampleSnapshot(generatedAt: string, mismatchScore: number, dislocationState: StateSnapshot["dislocationState"]): StateSnapshot {
  return {
    generatedAt,
    mismatchScore,
    dislocationState,
    stateRationale: "Test snapshot",
    actionabilityState: "watch",
    confidence: {
      coverage: 0.8,
      sourceQuality: {
        physicalStress: "fresh",
        priceSignal: "fresh",
        marketResponse: "fresh",
      },
    },
    subscores: { physicalStress: 0.5, priceSignal: 0.3, marketResponse: 0.2 },
    clocks: {
      shock: { ageSeconds: 60, label: "1 minute", classification: "acute" },
      dislocation: { ageSeconds: 120, label: "2 minutes", classification: "acute" },
      transmission: { ageSeconds: 180, label: "3 minutes", classification: "emerging" },
    },
    ledgerImpact: null,
    coverageConfidence: 0.8,
    sourceFreshness: {
      physicalStress: "fresh",
      priceSignal: "fresh",
      marketResponse: "fresh",
    },
    evidenceIds: [],
    guardrailFlags: [],
  };
}

describe("GET /api/state/history", () => {
  it("returns the latest snapshots in descending order", async () => {
    const env = createTestEnv() as unknown as Env;
    await writeSnapshot(env, sampleSnapshot("2026-04-16T00:00:00.000Z", 0.42, "mild_divergence"));
    await writeSnapshot(env, sampleSnapshot("2026-04-17T00:00:00.000Z", 0.63, "persistent_divergence"));

    const response = await worker.fetch(
      new Request("http://local/api/state/history?limit=1"),
      env,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { history: Array<{ generatedAt: string; mismatchScore: number; dislocationState: string }> };
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toEqual({
      generatedAt: "2026-04-17T00:00:00.000Z",
      mismatchScore: 0.63,
      dislocationState: "persistent_divergence",
    });
  });
});
