import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import worker from "../../src/index";
import { runCollection } from "../../src/jobs/collect";
import { runScore } from "../../src/jobs/score";
import { handleGetCoverage } from "../../src/routes/coverage";
import { handleGetEvidence } from "../../src/routes/evidence";
import { handleGuardrailFailures } from "../../src/routes/admin-guardrails";
import { handleCreateRule, handleListRules, handleRulesDryRun } from "../../src/routes/admin-rules";
import { handleGetStateHistory } from "../../src/routes/history";
import { handleCreateLedger, handleGetLedgerReview, handlePatchLedger } from "../../src/routes/ledger";
import { handleGetState } from "../../src/routes/state";
import { createTestEnv } from "../helpers/fake-d1";

describe("api contracts", () => {
  it("returns state, evidence, and coverage with expected fields", async () => {
    const env = createTestEnv() as unknown as Env;
    const scoreTime = new Date("2026-04-16T00:00:00.000Z");
    await runCollection(env, scoreTime);
    await runScore(env, scoreTime);

    await env.DB.prepare(
      `
      INSERT INTO run_evidence (
        run_key,
        evidence_key,
        evidence_group,
        observed_at,
        contribution,
        evidence_classification,
        coverage_quality,
        evidence_group_label,
        details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        `score-${scoreTime.getTime()}`,
        "legacy-physical-label",
        "physicalStress",
        scoreTime.toISOString(),
        0.5,
        "confirming",
        "well",
        "physical_stress_indicator",
        "{}"
      )
      .run();

    const stateResponse = await handleGetState(env);
    const state = (await stateResponse.json()) as Record<string, unknown>;
    expect(stateResponse.status).toBe(200);
    expect(state).toHaveProperty("generated_at");
    expect(state).toHaveProperty("mismatch_score");
    expect(state).toHaveProperty("actionability_state");
    expect(state).toHaveProperty("generatedAt");
    expect(state).toHaveProperty("dislocationState");
    expect(state).toHaveProperty("stateRationale");
    expect(state).toHaveProperty("subscores");
    expect(state).toHaveProperty("clocks");
    expect(state).toHaveProperty("guardrailFlags");
    expect(state).toHaveProperty("source_freshness");
    expect(state).toHaveProperty("coverage_confidence");

    const evidenceResponse = await handleGetEvidence(env);
    const evidence = (await evidenceResponse.json()) as Record<string, unknown>;
    expect(evidenceResponse.status).toBe(200);
    expect(evidence).toHaveProperty("evidence");
    expect(Array.isArray(evidence.evidence)).toBe(true);

    const evidenceItems = evidence.evidence as Array<Record<string, unknown>>;
    const firstEvidence = evidenceItems[0];
    expect(firstEvidence).toHaveProperty("evidenceKey");
    expect(firstEvidence).toHaveProperty("evidenceGroupLabel");
    expect(firstEvidence).toHaveProperty("classification");
    expect(firstEvidence).toHaveProperty("coverage");
    expect(new Set(evidenceItems.map((item) => item.evidenceGroupLabel))).toEqual(
      new Set(["physical_reality", "market_recognition", "transmission_pressure"])
    );

    const legacyEvidence = evidenceItems.find((item) => item.evidenceKey === "legacy-physical-label");
    expect(legacyEvidence).toMatchObject({
      evidenceGroupLabel: "physical_reality",
      evidence_group_label: "physical_reality"
    });

    const coverageResponse = await handleGetCoverage(env);
    const coverage = (await coverageResponse.json()) as Record<string, unknown>;
    expect(coverageResponse.status).toBe(200);
    expect(coverage).toHaveProperty("coverage_confidence");
    expect(coverage).toHaveProperty("source_freshness");
    expect(coverage).toHaveProperty("feed_freshness");

    const historyResponse = await handleGetStateHistory(new Request("http://local/api/state/history?limit=2"), env);
    const history = (await historyResponse.json()) as Record<string, unknown>;
    expect(historyResponse.status).toBe(200);
    expect(history).toHaveProperty("history");
    expect(Array.isArray(history.history)).toBe(true);

    const createRuleRequest = new Request("http://local/api/admin/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        engineKey: "oil_shock",
        ruleKey: "unit-test.rule",
        name: "Unit test rule",
        predicateJson: JSON.stringify({
          type: "threshold",
          metric: "priceSignal",
          operator: "<=",
          value: 0.5
        }),
        weight: 0.01,
        isActive: true
      })
    });
    const createRuleResponse = await handleCreateRule(createRuleRequest, env);
    expect(createRuleResponse.status).toBe(200);

    const rulesResponse = await handleListRules(env);
    const rules = (await rulesResponse.json()) as Record<string, unknown>;
    expect(rulesResponse.status).toBe(200);
    expect(rules).toHaveProperty("rules");
    expect(Array.isArray(rules.rules)).toBe(true);
    expect((rules.rules as Array<Record<string, unknown>>)[0]).toHaveProperty("ruleKey");

    const dryRunRequest = new Request("http://local/api/admin/rules/dry-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        physicalStress: 0.8,
        priceSignal: 0.2,
        marketResponse: 0.7
      })
    });
    const dryRunResponse = await handleRulesDryRun(dryRunRequest, env);
    const dryRun = (await dryRunResponse.json()) as Record<string, unknown>;
    expect(dryRunResponse.status).toBe(200);
    expect(dryRun).toHaveProperty("totalAdjustment");

  });

  it("returns guardrail incidents as renderable strings", async () => {
    const env = createTestEnv() as unknown as Env;
    await runScore(env, new Date("2026-04-16T00:00:00.000Z"));

    const response = await handleGuardrailFailures(env);
    const payload = (await response.json()) as { failures: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.failures).toHaveLength(3);
    expect(payload.failures.every((failure) => typeof failure === "string")).toBe(true);
    expect(payload.failures).toContain("Guardrail flagged physical-missing.");
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

  it("triggers a fresh snapshot through the manual poc route", async () => {
    const env = createTestEnv() as unknown as Env;
    await runCollection(env, new Date("2026-04-16T00:00:00.000Z"));
    await runScore(env, new Date("2026-04-16T00:00:00.000Z"));

    const beforeResponse = await handleGetState(env);
    const before = (await beforeResponse.json()) as Record<string, unknown>;

    const triggerResponse = await worker.fetch(
      new Request("http://local/api/admin/run-poc", { method: "POST" }),
      env,
      {} as ExecutionContext
    );
    const trigger = (await triggerResponse.json()) as Record<string, unknown>;
    expect(triggerResponse.status).toBe(200);
    expect(trigger).toHaveProperty("triggered", true);

    const afterResponse = await handleGetState(env);
    const after = (await afterResponse.json()) as Record<string, unknown>;
    expect(after.generatedAt).not.toBe(before.generatedAt);
  });
});
