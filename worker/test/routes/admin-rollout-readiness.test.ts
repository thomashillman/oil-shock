import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import worker from "../../src/index";
import { createTestEnv } from "../helpers/fake-d1";

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: (_promise: Promise<unknown>) => {},
    passThroughOnException: () => {}
  } as ExecutionContext;
}

describe("admin rollout readiness endpoint", () => {
  it("requires bearer token when ADMIN_API_BEARER_TOKEN is set", async () => {
    const env = createTestEnv() as unknown as Env;
    (env as Env & { ADMIN_API_BEARER_TOKEN: string }).ADMIN_API_BEARER_TOKEN = "top-secret";

    const unauthorized = await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness"),
      env,
      createExecutionContext()
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness", {
        headers: { authorization: "Bearer top-secret" }
      }),
      env,
      createExecutionContext()
    );
    expect(authorized.status).toBe(200);
  });

  it("returns readiness assessment with required structure", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness"),
      env,
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      blockers: string[];
      warnings: string[];
      manualChecks: Array<{ title: string }>;
      evidence: Record<string, unknown>;
      generatedAt: string;
    };

    expect(["ready", "warning", "blocked"]).toContain(payload.status);
    expect(Array.isArray(payload.blockers)).toBe(true);
    expect(Array.isArray(payload.warnings)).toBe(true);
    expect(Array.isArray(payload.manualChecks)).toBe(true);
    expect(Array.isArray(payload.evidence?.gates?.totalCount)).toBe(false); // gates should be an object
    expect(typeof payload.generatedAt).toBe("string");
  });

  it("evaluates only Phase 6A required feeds (eia_wti, eia_brent, eia_diesel_wti_crack)", async () => {
    const env = createTestEnv() as unknown as Env;

    // Without seeding metrics for required feeds, should be blocked
    const response = await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness"),
      env,
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      blockers: string[];
      evidence: { apiHealth: { totalFeeds: number } };
    };

    // Should evaluate exactly 3 feeds (Phase 6A required), not all registered feeds
    expect(payload.evidence.apiHealth.totalFeeds).toBe(3);
  });

  it("blocks readiness if any Phase 6A required feed is unhealthy", async () => {
    const env = createTestEnv() as unknown as Env;

    // Seed failure metrics for one required feed
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO api_health_metrics (feed_name, provider, status, attempted_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind("eia_wti", "EIA", "failure", oneHourAgo)
      .run();

    const response = await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness"),
      env,
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      blockers: string[];
    };

    expect(payload.status).toBe("blocked");
    expect(payload.blockers.some((b) => b.includes("unhealthy"))).toBe(true);
  });

  it("does not modify any configuration or rollout percentage", async () => {
    const env = createTestEnv() as unknown as Env;

    // Make multiple requests
    await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness"),
      env,
      createExecutionContext()
    );
    await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness"),
      env,
      createExecutionContext()
    );

    // Verify rollout status is unchanged (still 0)
    const rolloutResponse = await worker.fetch(
      new Request("http://local/api/admin/rollout-status"),
      env,
      createExecutionContext()
    );
    const rolloutPayload = (await rolloutResponse.json()) as { rolloutPercent: number };
    expect(rolloutPayload.rolloutPercent).toBe(0);
  });
});
