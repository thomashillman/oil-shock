import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import { runCollection } from "../../src/jobs/collect";
import { runScore } from "../../src/jobs/score";
import { handleGetCoverage } from "../../src/routes/coverage";
import { handleGetEvidence } from "../../src/routes/evidence";
import { handleCreateLedger, handleGetLedgerReview, handlePatchLedger } from "../../src/routes/ledger";
import { handleGetState } from "../../src/routes/state";
import { createTestEnv } from "../helpers/fake-d1";

describe("api contracts", () => {
  it("returns state, evidence, and coverage with expected fields", async () => {
    const env = createTestEnv() as unknown as Env;
    await runCollection(env, new Date("2026-04-16T00:00:00.000Z"));
    await runScore(env, new Date("2026-04-16T00:00:00.000Z"));

    const stateResponse = await handleGetState(env);
    const state = (await stateResponse.json()) as Record<string, unknown>;
    expect(stateResponse.status).toBe(200);
    expect(state).toHaveProperty("generatedAt");
    expect(state).toHaveProperty("mismatchScore");
    expect(state).toHaveProperty("dislocationState");
    expect(state).toHaveProperty("stateRationale");
    expect(state).toHaveProperty("actionabilityState");
    expect(state).toHaveProperty("confidence");
    expect(state).toHaveProperty("subscores");
    expect(state).toHaveProperty("clocks");
    expect(state).toHaveProperty("sourceFreshness");
    expect(state).toHaveProperty("coverageConfidence");

    const evidenceResponse = await handleGetEvidence(env);
    const evidence = (await evidenceResponse.json()) as Record<string, unknown>;
    expect(evidenceResponse.status).toBe(200);
    expect(evidence).toHaveProperty("evidence");

    const coverageResponse = await handleGetCoverage(env);
    const coverage = (await coverageResponse.json()) as Record<string, unknown>;
    expect(coverageResponse.status).toBe(200);
    expect(coverage).toHaveProperty("coverage_confidence");
    expect(coverage).toHaveProperty("source_freshness");
  });

  it("creates and updates ledger entries", async () => {
    const env = createTestEnv() as unknown as Env;
    const createRequest = new Request("http://local/api/ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "ledger-test",
        rationale: "Test rationale",
        impactDirection: "increase",
        reviewDueAt: "2026-04-15T00:00:00.000Z"
      })
    });

    const createResponse = await handleCreateLedger(createRequest, env);
    expect(createResponse.status).toBe(201);

    const reviewResponse = await handleGetLedgerReview(env);
    const reviewPayload = (await reviewResponse.json()) as { review_due: Array<{ id: number }> };
    expect(reviewResponse.status).toBe(200);
    expect(reviewPayload.review_due.length).toBe(1);

    const patchRequest = new Request("http://local/api/ledger/1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rationale: "Updated rationale"
      })
    });

    const patchResponse = await handlePatchLedger(patchRequest, env, String(reviewPayload.review_due[0].id));
    expect(patchResponse.status).toBe(200);
  });
});
