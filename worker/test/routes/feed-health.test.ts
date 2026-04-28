import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import type { Env } from "../../src/env";

type Row = Record<string, unknown>;

class MockPreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: MockD1Database,
    private readonly query: string
  ) {}

  bind(...params: unknown[]): MockPreparedStatement {
    this.params = params;
    return this;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return this.db.all<T>(this.query, this.params);
  }
}

class MockD1Database {
  constructor(
    private readonly feedRegistry: Row[],
    private readonly feedChecks: Row[]
  ) {}

  prepare(query: string): MockPreparedStatement {
    return new MockPreparedStatement(this, query);
  }

  async all<T>(query: string, params: unknown[]): Promise<{ results: T[] }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from feed_registry") && normalized.includes("order by feed_key")) {
      const engineKey = params[0];
      const rows = this.feedRegistry
        .filter((row) => row.engine_key === engineKey)
        .sort((a, b) => String(a.feed_key).localeCompare(String(b.feed_key)));
      return { results: rows as T[] };
    }
    if (normalized.includes("from feed_checks") && normalized.includes("order by checked_at desc")) {
      const engineKey = params[0];
      const rows = this.feedChecks
        .filter((row) => row.engine_key === engineKey)
        .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)));
      return { results: rows as T[] };
    }

    throw new Error(`Unhandled all query: ${query}`);
  }
}

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: (_promise: Promise<unknown>) => {},
    passThroughOnException: () => {}
  } as ExecutionContext;
}

function createEnv(feedRegistry: Row[], feedChecks: Row[], adminToken?: string): Env {
  return {
    APP_ENV: "local",
    DB: new MockD1Database(feedRegistry, feedChecks) as unknown as D1Database,
    EIA_API_KEY: "test",
    GIE_API_KEY: "test",
    ADMIN_API_BEARER_TOKEN: adminToken
  } as Env;
}

describe("GET /api/feed-health", () => {
  it("returns stable read-only health payload based on registry and latest checks", async () => {
    const env = createEnv(
      [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", display_name: "WTI-Brent", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", display_name: "Diesel-WTI", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.no_checks", display_name: "No Checks", enabled: 1 }
      ],
      [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", checked_at: "2026-04-27T00:00:00.000Z", step: "save_observation", result: "success", status: "ok", error_message: null, latency_ms: 25 },
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", checked_at: "2026-04-26T00:00:00.000Z", step: "save_observation", result: "failed", status: "error", error_message: "older" },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", checked_at: "2026-04-27T00:00:00.000Z", step: "save_observation", result: "failed", status: "error", error_message: "write failed", latency_ms: 19 }
      ]
    );

    const response = await worker.fetch(new Request("http://local/api/feed-health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      feeds: Array<{
        engineKey: string;
        feedKey: string;
        displayName: string | null;
        enabled: boolean;
        status: "ok" | "error" | "unknown";
        latestCheck: null | {
          checkedAt: string;
          step: string | null;
          result: string | null;
          status: string;
          errorMessage: string | null;
          latencyMs: number | null;
        };
      }>;
    };

    expect(Array.isArray(body.feeds)).toBe(true);
    expect(body.feeds).toHaveLength(3);

    expect(body.feeds[0]).toHaveProperty("engineKey");
    expect(body.feeds[0]).toHaveProperty("feedKey");
    expect(body.feeds[0]).toHaveProperty("displayName");
    expect(body.feeds[0]).toHaveProperty("enabled");
    expect(body.feeds[0]).toHaveProperty("status");
    expect(body.feeds[0]).toHaveProperty("latestCheck");

    expect(body.feeds.find((feed) => feed.feedKey === "energy_spread.wti_brent_spread")?.status).toBe("ok");

    const failed = body.feeds.find((feed) => feed.feedKey === "energy_spread.diesel_wti_crack");
    expect(failed?.status).toBe("error");
    expect(failed?.latestCheck?.errorMessage).toBe("write failed");

    const unknown = body.feeds.find((feed) => feed.feedKey === "energy_spread.no_checks");
    expect(unknown?.status).toBe("unknown");
    expect(unknown?.latestCheck).toBeNull();
  });

  it("does not require admin auth", async () => {
    const env = createEnv(
      [{ engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", display_name: "WTI-Brent", enabled: 1 }],
      [],
      "secret-token"
    );

    const response = await worker.fetch(new Request("http://local/api/feed-health"), env, createExecutionContext());
    expect(response.status).toBe(200);
  });
});
