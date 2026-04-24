import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import { writeSnapshot } from "../../src/db/client";
import { handleGetStateV2 } from "../../src/routes/state-v2";
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
    guardrailFlags: []
  };
}

describe("GET /api/state (scores-backed v2)", () => {
  it("returns scores-backed response with all snapshot fields", async () => {
    // Create env with dual-write enabled
    const baseEnv = createTestEnv();
    const env = {
      ...baseEnv,
      ENABLE_SCORE_DUAL_WRITE: "true"
    } as unknown as Env;

    await writeSnapshot(env, sampleSnapshot());

    const response = await handleGetStateV2(env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    // Verify all expected fields are present
    expect(body.generatedAt).toBe(sampleSnapshot().generatedAt);
    expect(body.mismatchScore).toBe(0.42);
    expect(body.dislocationState).toBe("mild_divergence");
    expect(body.stateRationale).toBe("Physical pressure persists while market recognition lags.");
    expect(body.actionabilityState).toBe("watch");

    // Verify subscores
    const subscores = body.subscores as Record<string, unknown>;
    expect(Object.keys(subscores).sort()).toEqual(EXPECTED_SUBSCORE_KEYS);
    expect(subscores.physicalStress).toBe(0.7);
    expect(subscores.priceSignal).toBe(0.3);
    expect(subscores.marketResponse).toBe(0.55);

    // Verify clocks
    const clocks = body.clocks as Record<string, unknown>;
    expect(Object.keys(clocks).sort()).toEqual(EXPECTED_CLOCK_KEYS);

    // Verify freshness
    const freshness = body.sourceFreshness as Record<string, unknown>;
    expect(Object.keys(freshness).sort()).toEqual(EXPECTED_SUBSCORE_KEYS);

    // Verify confidence
    const confidence = body.confidence as { coverage: number; sourceQuality: Record<string, unknown> };
    expect(confidence.coverage).toBe(0.85);

    // Verify evidence
    expect(body.evidenceIds).toEqual(["physical-pressure", "recognition-gap", "transmission-stress"]);
    expect(body.guardrailFlags).toEqual([]);
  });

  it("returns 404 when no scores exist", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await handleGetStateV2(env);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("no_score");
  });

  it("handles malformed flags_json gracefully", async () => {
    const env = createTestEnv() as unknown as Env;

    // Insert a scores row with invalid JSON directly
    await env.DB.prepare(`
      INSERT INTO scores (engine_key, feed_key, scored_at, score_value, confidence, flags_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind("oil_shock", "oil_shock.mismatch_score", "2026-04-16T00:00:00.000Z", 0.5, 0.8, "{invalid json")
      .run();

    const response = await handleGetStateV2(env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    // Should have defaults due to malformed JSON
    expect(body.mismatchScore).toBe(0.5);
    expect(body.dislocationState).toBe("unknown");
    expect(body.actionabilityState).toBe("none");
  });
});
