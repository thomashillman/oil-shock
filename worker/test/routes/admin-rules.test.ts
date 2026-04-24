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

describe("admin rules tooling", () => {

  it("requires bearer token on admin routes when ADMIN_API_BEARER_TOKEN is set", async () => {
    const env = createTestEnv() as unknown as Env;
    (env as Env & { ADMIN_API_BEARER_TOKEN: string }).ADMIN_API_BEARER_TOKEN = "top-secret";

    const unauthorized = await worker.fetch(new Request("http://local/api/admin/rules"), env, createExecutionContext());
    expect(unauthorized.status).toBe(401);

    const authorized = await worker.fetch(
      new Request("http://local/api/admin/rules", { headers: { authorization: "Bearer top-secret" } }),
      env,
      createExecutionContext()
    );
    expect(authorized.status).toBe(200);
  });

  it("returns feed_freshness in coverage payload", async () => {
    const env = createTestEnv() as unknown as Env;
    await writeSnapshot(env, {
      generatedAt: "2026-04-22T00:00:00.000Z",
      mismatchScore: 0.2,
      dislocationState: "aligned",
      stateRationale: "test",
      actionabilityState: "none",
      confidence: { coverage: 0.8, sourceQuality: {} },
      subscores: { physicalStress: 0.6, priceSignal: 0.4, marketResponse: 0.2 },
      clocks: {
        shock: { ageSeconds: 1, label: "x", classification: "acute" },
        dislocation: { ageSeconds: 1, label: "x", classification: "acute" },
        transmission: { ageSeconds: 1, label: "x", classification: "acute" },
      },
      ledgerImpact: null,
      coverageConfidence: 0.8,
      sourceFreshness: { physicalStress: "stale", priceSignal: "fresh", marketResponse: "missing" },
      evidenceIds: [],
      guardrailFlags: [],
    });

    const response = await worker.fetch(new Request("http://local/api/coverage"), env, createExecutionContext());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { feed_freshness: Record<string, string> };
    expect(payload.feed_freshness.spot_wti).toBe("fresh");
    expect(payload.feed_freshness.eu_pipeline_flow).toBe("stale");
    expect(payload.feed_freshness.sec_impairment).toBe("missing");
  });
  it("lists rules and supports dry-run", async () => {
    const env = createTestEnv() as unknown as Env;

    const listResponse = await worker.fetch(new Request("http://local/api/admin/rules"), env, createExecutionContext());
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { rules: Array<{ ruleKey: string }> };
    expect(listBody.rules.length).toBeGreaterThan(0);

    const dryRunResponse = await worker.fetch(
      new Request("http://local/api/admin/rules/dry-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ physicalStress: 0.75, priceSignal: 0.2, marketResponse: 0.6 })
      }),
      env,
      createExecutionContext()
    );

    expect(dryRunResponse.status).toBe(200);
    const dryRunBody = (await dryRunResponse.json()) as { totalAdjustment: number; appliedRules: unknown[] };
    expect(dryRunBody.totalAdjustment).not.toBe(0);
    expect(dryRunBody.appliedRules.length).toBeGreaterThan(0);
  });

  it("returns latest guardrail failures", async () => {
    const env = createTestEnv() as unknown as Env;
    await writeSnapshot(env, {
      generatedAt: "2026-04-23T00:00:00.000Z",
      mismatchScore: 0.2,
      dislocationState: "aligned",
      stateRationale: "test",
      actionabilityState: "none",
      confidence: { coverage: 0.7, sourceQuality: {} },
      subscores: { physicalStress: 0.2, priceSignal: 0.4, marketResponse: 0.1 },
      clocks: {
        shock: { ageSeconds: 1, label: "x", classification: "acute" },
        dislocation: { ageSeconds: 1, label: "x", classification: "acute" },
        transmission: { ageSeconds: 1, label: "x", classification: "acute" }
      },
      ledgerImpact: null,
      coverageConfidence: 0.7,
      sourceFreshness: { physicalStress: "fresh", priceSignal: "stale", marketResponse: "missing" },
      evidenceIds: [],
      guardrailFlags: ["stale_dimension:priceSignal", "missing_dimension:marketResponse"]
    });

    const response = await worker.fetch(new Request("http://local/api/admin/guardrails/failures"), env, createExecutionContext());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { failures: string[] };
    expect(body.failures).toEqual(["stale_dimension:priceSignal", "missing_dimension:marketResponse"]);
  });

  it("rejects invalid predicate updates", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await worker.fetch(
      new Request("http://local/api/admin/rules/oilshock.recognition_gap_bonus", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ predicateJson: "{\"type\":\"threshold\",\"metric\":\"invalid\"}" })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(400);
  });

  it("supports dry-run rule override without persisting", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await worker.fetch(
      new Request("http://local/api/admin/rules/dry-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          physicalStress: 0.1,
          priceSignal: 0.8,
          marketResponse: 0.1,
          overrideRule: {
            ruleKey: "oilshock.recognition_gap_bonus",
            weight: 0.25,
            predicate: { type: "threshold", metric: "priceSignal", operator: ">=", value: 0.7 }
          }
        })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { totalAdjustment: number };
    expect(payload.totalAdjustment).toBe(0.25);
  });

  it("creates a new rule with validated predicate syntax", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await worker.fetch(
      new Request("http://local/api/admin/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ruleKey: "oilshock.test.new_bonus",
          name: "New test bonus",
          weight: 0.04,
          predicateJson:
            "{\"type\":\"threshold\",\"metric\":\"marketResponse\",\"operator\":\">=\",\"value\":0.4}"
        })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(200);

    const listResponse = await worker.fetch(new Request("http://local/api/admin/rules"), env, createExecutionContext());
    const body = (await listResponse.json()) as { rules: Array<{ ruleKey: string }> };
    expect(body.rules.some((rule) => rule.ruleKey === "oilshock.test.new_bonus")).toBe(true);
  });

  it("returns historical backfill comparison rows", async () => {
    const env = createTestEnv() as unknown as Env;
    await writeSnapshot(env, {
      generatedAt: "2026-04-21T00:00:00.000Z",
      mismatchScore: 0.2,
      dislocationState: "aligned",
      stateRationale: "test",
      actionabilityState: "none",
      confidence: { coverage: 0.8, sourceQuality: {} },
      subscores: { physicalStress: 0.7, priceSignal: 0.3, marketResponse: 0.6 },
      clocks: {
        shock: { ageSeconds: 1, label: "x", classification: "acute" },
        dislocation: { ageSeconds: 1, label: "x", classification: "acute" },
        transmission: { ageSeconds: 1, label: "x", classification: "acute" }
      },
      ledgerImpact: null,
      coverageConfidence: 0.8,
      sourceFreshness: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "fresh" },
      evidenceIds: [],
      guardrailFlags: []
    });

    const response = await worker.fetch(
      new Request("http://local/api/admin/backfill/rescore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          limit: 10,
          overrideRule: {
            ruleKey: "oilshock.backfill.override",
            weight: 0.1,
            predicate: { type: "threshold", metric: "physicalStress", operator: ">=", value: 0.6 }
          }
        })
      }),
      env,
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      comparisons: Array<{ baselineScore: number; rescoredWithOverride: number }>;
    };
    expect(payload.comparisons.length).toBeGreaterThan(0);
    expect(payload.comparisons[0].rescoredWithOverride).toBeGreaterThan(payload.comparisons[0].baselineScore);
  });

  it("rejects invalid dry-run override weight", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await worker.fetch(
      new Request("http://local/api/admin/rules/dry-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          physicalStress: 0.4,
          priceSignal: 0.4,
          marketResponse: 0.4,
          overrideRule: {
            ruleKey: "bad.weight",
            weight: "bad",
            predicate: { type: "threshold", metric: "marketResponse", operator: ">=", value: 0.4 }
          }
        })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid backfill limit", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await worker.fetch(
      new Request("http://local/api/admin/backfill/rescore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: "NaN" })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(400);
  });

  it("updates oil_shock rules when engineKey is omitted", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(
      new Request("http://local/api/admin/rules/oilshock.confirmation.spread_widening", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weight: 0.08,
          isActive: true
        })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(200);
  });

  it("updates energy rules when engineKey is specified", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(
      new Request("http://local/api/admin/rules/energy.confirmation.spread_widening", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engineKey: "energy",
          weight: 0.05,
          isActive: true
        })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(200);
  });

  it("updates macro_releases rules when engineKey is specified", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(
      new Request("http://local/api/admin/rules/macro.inflation_surprise_high", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engineKey: "macro_releases",
          weight: 0.06,
          isActive: false
        })
      }),
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(200);
  });
});
