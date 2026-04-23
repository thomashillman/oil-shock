import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import worker from "../../src/index";
import { createTestEnv } from "../helpers/fake-d1";
import { writeSnapshot } from "../../src/db/client";

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: (_promise: Promise<unknown>) => {},
    passThroughOnException: () => {}
  } as ExecutionContext;
}

describe("admin compare score paths endpoint", () => {
  it("returns 404 when Phase 1 parallel running is disabled", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(
      new Request("http://local/api/admin/compare-score-paths"),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("not_available");
  });

  it("requires authorization when ADMIN_API_BEARER_TOKEN is set", async () => {
    const env = createTestEnv() as unknown as Env;
    (env as Env & { ADMIN_API_BEARER_TOKEN: string }).ADMIN_API_BEARER_TOKEN = "test-token";
    (env as Env & { ENABLE_PHASE1_PARALLEL_RUNNING: string }).ENABLE_PHASE1_PARALLEL_RUNNING = "true";

    const unauthorized = await worker.fetch(
      new Request("http://local/api/admin/compare-score-paths"),
      env,
      createExecutionContext()
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await worker.fetch(
      new Request("http://local/api/admin/compare-score-paths", {
        headers: { authorization: "Bearer test-token" }
      }),
      env,
      createExecutionContext()
    );
    expect(authorized.status).toBe(200);
  });

  it("returns comparison data when Phase 1 is enabled", async () => {
    const env = createTestEnv() as unknown as Env;
    (env as Env & { ENABLE_PHASE1_PARALLEL_RUNNING: string }).ENABLE_PHASE1_PARALLEL_RUNNING = "true";

    // Write a snapshot to the database
    await writeSnapshot(env, {
      generatedAt: "2026-04-22T00:00:00.000Z",
      mismatchScore: 0.65,
      dislocationState: "persistent_divergence",
      stateRationale: "test state",
      actionabilityState: "watch",
      confidence: { coverage: 0.8, sourceQuality: {} },
      subscores: { physicalStress: 0.6, priceSignal: 0.4, marketResponse: 0.2 },
      clocks: {
        shock: { ageSeconds: 1, label: "x", classification: "acute" },
        dislocation: { ageSeconds: 1, label: "x", classification: "acute" },
        transmission: { ageSeconds: 1, label: "x", classification: "acute" },
      },
      ledgerImpact: null,
      coverageConfidence: 0.8,
      sourceFreshness: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "fresh" },
      evidenceIds: [],
      guardrailFlags: ["missing_dimension:foo"],
    });

    const response = await worker.fetch(
      new Request("http://local/api/admin/compare-score-paths"),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      snapshotVersion: { mismatchScore: number; confidence: number; dislocationState: string; flagCount: number } | null;
      scoresTableVersion: { scoreValue: number; confidence: number; flags: string[] } | null;
      comparison: { scoreDiff: number; confidenceDiff: number; flagsMatch: boolean; stateMatch: boolean } | null;
      observedAt: string;
    };

    expect(body.snapshotVersion).not.toBeNull();
    expect(body.snapshotVersion?.mismatchScore).toBe(0.65);
    expect(body.snapshotVersion?.confidence).toBe(0.8);
    expect(body.snapshotVersion?.dislocationState).toBe("persistent_divergence");
    expect(body.snapshotVersion?.flagCount).toBe(1);

    // scores table may not have data if dual-write isn't enabled
    expect(body.observedAt).toBeTruthy();
  });
});
