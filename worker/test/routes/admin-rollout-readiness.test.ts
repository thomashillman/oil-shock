import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import worker from "../../src/index";
import { createTestEnv, disableFeedInRegistry, addExtraFeedToRegistry } from "../helpers/fake-d1";

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

  it("ready path: all Phase 6A feeds registered, healthy, gates signed, rollout 0%", async () => {
    const env = createTestEnv() as unknown as Env;
    const now = new Date().toISOString();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Seed successful metrics for all three Phase 6A required feeds
    for (const feedName of ["eia_wti", "eia_brent", "eia_diesel_wti_crack"]) {
      await env.DB.prepare(
        `INSERT INTO api_health_metrics (feed_name, provider, status, latency_ms, attempted_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(feedName, "EIA", "success", 500, fifteenMinutesAgo)
        .run();
    }

    // Seed signed-off pre-deploy gates  - need at least 1 gate
    await env.DB.prepare(
      `INSERT INTO pre_deploy_gates (flag_name, gate_name, status, signed_off_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind("ENABLE_MACRO_SIGNALS", "energy_determinism", "SIGNED_OFF", now)
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
      evidence: { apiHealth: { totalFeeds: number; healthyFeeds: number } };
    };

    expect(payload.status).toBe("ready");
    expect(payload.blockers).toHaveLength(0);
    expect(payload.evidence.apiHealth.totalFeeds).toBe(3);
    expect(payload.evidence.apiHealth.healthyFeeds).toBe(3);
  });

  it("blocks when required Phase 6A feed is missing from registry", async () => {
    const env = createTestEnv() as unknown as Env;

    // Disable one of the three required feeds in the registry
    disableFeedInRegistry(env, "eia_wti");

    // Seed metrics for the two remaining feeds
    const now = new Date().toISOString();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    for (const feedName of ["eia_brent", "eia_diesel_wti_crack"]) {
      await env.DB.prepare(
        `INSERT INTO api_health_metrics (feed_name, provider, status, latency_ms, attempted_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(feedName, "EIA", "success", 500, fifteenMinutesAgo)
        .run();
    }

    // Seed gates
    await env.DB.prepare(
      `INSERT INTO pre_deploy_gates (flag_name, gate_name, status, signed_off_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind("ENABLE_MACRO_SIGNALS", "test_gate", "SIGNED_OFF", now)
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

    // Missing required feed (eia_wti) should block readiness
    expect(payload.status).toBe("blocked");
    expect(payload.blockers.some((b) => b.includes("missing"))).toBe(true);
  });

  it("ignores extra seeded feeds: only Phase 6A required feeds affect readiness", async () => {
    const env = createTestEnv() as unknown as Env;
    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Add an extra enabled feed to the registry that is not Phase 6A required
    addExtraFeedToRegistry(env, "inventory_stock", "EIA", "Inventory Stock");

    // Seed healthy metrics for all three Phase 6A required feeds
    for (const feedName of ["eia_wti", "eia_brent", "eia_diesel_wti_crack"]) {
      await env.DB.prepare(
        `INSERT INTO api_health_metrics (feed_name, provider, status, latency_ms, attempted_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(feedName, "EIA", "success", 500, oneHourAgo)
        .run();
    }

    // Seed failure metrics for the extra seeded feed (not Phase 6A required)
    // The endpoint should ignore this because it's not Phase 6A required
    await env.DB.prepare(
      `INSERT INTO api_health_metrics (feed_name, provider, status, attempted_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind("inventory_stock", "EIA", "failure", oneHourAgo)
      .run();

    // Seed gates
    await env.DB.prepare(
      `INSERT INTO pre_deploy_gates (flag_name, gate_name, status, signed_off_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind("ENABLE_MACRO_SIGNALS", "test_gate", "SIGNED_OFF", now)
      .run();

    const response = await worker.fetch(
      new Request("http://local/api/admin/rollout-readiness"),
      env,
      createExecutionContext()
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      evidence: { apiHealth: { totalFeeds: number } };
    };

    // Should only count Phase 6A required feeds (3), not the extra one
    expect(payload.evidence.apiHealth.totalFeeds).toBe(3);
  });

  it("blocks on conservative error: returns blocked status on DB failure or empty evidence", async () => {
    const env = createTestEnv() as unknown as Env;

    // Without any seeded data, endpoint should be conservative and block
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

    // Empty evidence should block, never silently pass
    expect(payload.status).toBe("blocked");
    expect(payload.blockers.length).toBeGreaterThan(0);
  });

  it("time-window semantics: requires fresh success within freshnessWindowHours (24h)", async () => {
    const env = createTestEnv() as unknown as Env;
    const now = new Date().toISOString();

    // Seed very old success metrics (25 hours ago, beyond 24h freshness window)
    const twentyFiveHoursAgo = new Date(
      Date.now() - 25 * 60 * 60 * 1000
    ).toISOString();

    for (const feedName of ["eia_wti", "eia_brent", "eia_diesel_wti_crack"]) {
      await env.DB.prepare(
        `INSERT INTO api_health_metrics (feed_name, provider, status, latency_ms, attempted_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(feedName, "EIA", "success", 500, twentyFiveHoursAgo)
        .run();
    }

    // Seed gates
    await env.DB.prepare(
      `INSERT INTO pre_deploy_gates (flag_name, gate_name, status, signed_off_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind("ENABLE_MACRO_SIGNALS", "test_gate", "SIGNED_OFF", now)
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

    // Metrics older than 24h freshness window should be treated as stale/unhealthy
    expect(payload.status).toBe("blocked");
    expect(payload.blockers.some((b) => b.includes("unhealthy"))).toBe(true);
  });

  it("time-window semantics: accepts fresh success within freshnessWindowHours (2h old passes)", async () => {
    const env = createTestEnv() as unknown as Env;
    const now = new Date().toISOString();

    // Seed recent success metrics (2 hours ago, within 24h freshness window)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    for (const feedName of ["eia_wti", "eia_brent", "eia_diesel_wti_crack"]) {
      await env.DB.prepare(
        `INSERT INTO api_health_metrics (feed_name, provider, status, latency_ms, attempted_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(feedName, "EIA", "success", 500, twoHoursAgo)
        .run();
    }

    // Seed gates
    await env.DB.prepare(
      `INSERT INTO pre_deploy_gates (flag_name, gate_name, status, signed_off_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind("ENABLE_MACRO_SIGNALS", "test_gate", "SIGNED_OFF", now)
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
      evidence: { apiHealth: { healthyFeeds: number; totalFeeds: number } };
    };

    // Metrics within 24h freshness window should be healthy
    expect(payload.status).toBe("ready");
    expect(payload.blockers).toHaveLength(0);
    expect(payload.evidence.apiHealth.healthyFeeds).toBe(3);
    expect(payload.evidence.apiHealth.totalFeeds).toBe(3);
  });

  it("does not modify configuration or rollout percentage", async () => {
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
