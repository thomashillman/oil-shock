import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import { writeSnapshot } from "../../src/db/client";
import { handleGetState } from "../../src/routes/state";
import type { StateSnapshot } from "../../src/types";
import { createTestEnv } from "../helpers/fake-d1";

const EXPECTED_SUBSCORE_KEYS = ["physicalStress", "priceSignal", "marketResponse"].sort();
const EXPECTED_CLOCK_KEYS = ["shock", "dislocation", "transmission"].sort();

function sampleSnapshot(): StateSnapshot {
  return {
    generatedAt: "2026-04-16T00:00:00.000Z",
    mismatchScore: 0.42,
    dislocationState: "mild_divergence",
    stateRationale: "Physical pressure persists while market recognition lags.",
    actionabilityState: "watch",
    confidence: {
      coverage: 0.85,
      sourceQuality: {
        physicalStress: "fresh",
        priceSignal: "fresh",
        marketResponse: "stale",
      },
    },
    subscores: { physicalStress: 0.7, priceSignal: 0.3, marketResponse: 0.55 },
    clocks: {
      shock: { ageSeconds: 3600, label: "1 hour", classification: "acute" },
      dislocation: { ageSeconds: 7200, label: "2 hours", classification: "acute" },
      transmission: { ageSeconds: 1800, label: "30 minutes", classification: "emerging" },
    },
    ledgerImpact: null,
    coverageConfidence: 0.85,
    sourceFreshness: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "stale" },
    evidenceIds: ["physical-pressure", "recognition-gap", "transmission-stress"],
  };
}

describe("GET /api/state response shape (subscore/freshness contract)", () => {
  it("emits the expected subscore, freshness, and clock key sets", async () => {
    const env = createTestEnv() as unknown as Env;
    await writeSnapshot(env, sampleSnapshot());

    const response = await handleGetState(env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    const subscores = body.subscores as Record<string, unknown>;
    expect(Object.keys(subscores).sort()).toEqual(EXPECTED_SUBSCORE_KEYS);
    for (const key of EXPECTED_SUBSCORE_KEYS) {
      expect(typeof subscores[key]).toBe("number");
    }

    const freshness = body.sourceFreshness as Record<string, unknown>;
    expect(Object.keys(freshness).sort()).toEqual(EXPECTED_SUBSCORE_KEYS);
    for (const key of EXPECTED_SUBSCORE_KEYS) {
      expect(["fresh", "stale", "missing"]).toContain(freshness[key]);
    }

    const confidence = body.confidence as { sourceQuality: Record<string, unknown> };
    expect(Object.keys(confidence.sourceQuality).sort()).toEqual(EXPECTED_SUBSCORE_KEYS);

    const clocks = body.clocks as Record<string, unknown>;
    expect(Object.keys(clocks).sort()).toEqual(EXPECTED_CLOCK_KEYS);
  });

  it("returns 404 when no snapshot exists", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await handleGetState(env);
    expect(response.status).toBe(404);
  });
});
