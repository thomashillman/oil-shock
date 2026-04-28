import { describe, expect, it } from "vitest";
import worker from "../../src";
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

  async run(): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    return this.db.run(this.query, this.params);
  }
}

class MockD1Database {
  public mutationRuns = 0;

  constructor(
    private readonly feedRegistry: Row[],
    private readonly feedChecks: Row[],
    private readonly observations: Row[],
    private readonly ruleState: Row[],
    private readonly triggerEvents: Row[],
    private readonly actionLog: Row[]
  ) {}

  prepare(query: string): MockPreparedStatement {
    return new MockPreparedStatement(this, query);
  }

  async run<T>(_query: string, _params: unknown[]): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    this.mutationRuns += 1;
    return { success: true, meta: { last_row_id: 0 } };
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

    if (normalized.includes("from observations") && normalized.includes("order by observed_at desc")) {
      const [engineKey, limit] = params;
      const rows = this.observations
        .filter((row) => row.engine_key === engineKey)
        .sort((a, b) => {
          const observed = String(b.observed_at).localeCompare(String(a.observed_at));
          if (observed !== 0) return observed;
          const asOf = String(b.as_of_date).localeCompare(String(a.as_of_date));
          if (asOf !== 0) return asOf;
          return String(a.series_key).localeCompare(String(b.series_key));
        })
        .slice(0, Number(limit));
      return { results: rows as T[] };
    }

    if (normalized.includes("from rule_state") && normalized.includes("order by evaluated_at desc")) {
      const [engineKey, limit] = params;
      const rows = this.ruleState
        .filter((row) => row.engine_key === engineKey)
        .sort((a, b) => {
          const evaluated = String(b.evaluated_at).localeCompare(String(a.evaluated_at));
          if (evaluated !== 0) return evaluated;
          const rule = String(a.rule_key).localeCompare(String(b.rule_key));
          if (rule !== 0) return rule;
          return String(a.state_key).localeCompare(String(b.state_key));
        })
        .slice(0, Number(limit));
      return { results: rows as T[] };
    }

    if (normalized.includes("from trigger_events") && normalized.includes("order by triggered_at desc")) {
      const [engineKey, limit] = params;
      const rows = this.triggerEvents
        .filter((row) => row.engine_key === engineKey)
        .sort((a, b) => String(b.triggered_at).localeCompare(String(a.triggered_at)))
        .slice(0, Number(limit));
      return { results: rows as T[] };
    }

    if (normalized.includes("from action_log") && normalized.includes("order by decided_at desc")) {
      const [engineKey, limit] = params;
      const rows = this.actionLog
        .filter((row) => row.engine_key === engineKey)
        .sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)))
        .slice(0, Number(limit));
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

function createEnv(db: MockD1Database): Env {
  return {
    APP_ENV: "local",
    DB: db as unknown as D1Database,
    EIA_API_KEY: "test",
    GIE_API_KEY: "test"
  } as Env;
}

describe("engine runtime routes", () => {
  it("GET /api/engines returns Energy as only active runtime engine and excludes CPI", async () => {
    const db = new MockD1Database([], [], [], [], [], []);
    const env = createEnv(db);

    const response = await worker.fetch(new Request("http://local/api/engines"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      engines: Array<{ engineKey: string; runtimeChain: string[] }>;
    };

    expect(body.engines).toHaveLength(1);
    expect(body.engines[0]?.engineKey).toBe("energy");
    expect(body.engines[0]?.runtimeChain).toEqual([
      "observations",
      "rule_state",
      "trigger_events",
      "guardrail_policy",
      "action_log"
    ]);
    expect(body.engines.some((engine) => engine.engineKey === "cpi")).toBe(false);
  });

  it("GET /api/engines/energy/runtime returns stable runtime shape with newest-first rows", async () => {
    const db = new MockD1Database(
      [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", display_name: "WTI-Brent", enabled: 1 }
      ],
      [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", checked_at: "2026-04-27T12:00:00.000Z", step: "save", result: "success", status: "ok", error_message: null, latency_ms: 42 }
      ],
      [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", series_key: "energy_spread.wti_brent_spread", release_key: "2026-04-27", as_of_date: "2026-04-27", observed_at: "2026-04-27T00:00:00.000Z", value: 0.4 },
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", series_key: "energy_spread.wti_brent_spread", release_key: "2026-04-28", as_of_date: "2026-04-28", observed_at: "2026-04-28T00:00:00.000Z", value: 0.8 }
      ],
      [
        { engine_key: "energy", rule_key: "energy.confirmation.spread_widening", state_key: "current", release_key: "2026-04-28", state_json: '{"status":"active"}', evaluated_at: "2026-04-28T00:00:00.000Z" }
      ],
      [
        { engine_key: "energy", rule_key: "energy.confirmation.spread_widening", release_key: "2026-04-27", transition_key: "inactive->active", previous_state: "inactive", new_state: "active", status: "confirmed", reason: "older", run_key: "run-1", triggered_at: "2026-04-27T00:00:00.000Z", computed_json: '{}', details_json: '{}' },
        { engine_key: "energy", rule_key: "energy.confirmation.spread_widening", release_key: "2026-04-28", transition_key: "inactive->active", previous_state: "inactive", new_state: "active", status: "confirmed", reason: "newer", run_key: "run-2", triggered_at: "2026-04-28T00:00:00.000Z", computed_json: '{"spread":0.7}', details_json: '{"source":"rule-engine"}' }
      ],
      [
        { engine_key: "energy", rule_key: "energy.confirmation.spread_widening", release_key: "2026-04-27", decision_key: "older", decision: "ignored", action_type: "log_only", rationale: "older", decided_at: "2026-04-27T00:01:00.000Z", details_json: '{"guardrail":{"result":"pass"}}' },
        { engine_key: "energy", rule_key: "energy.confirmation.spread_widening", release_key: "2026-04-28", decision_key: "newer", decision: "ignored", action_type: "log_only", rationale: "newer", decided_at: "2026-04-28T00:01:00.000Z", details_json: '{"guardrail":{"result":"blocked","reasons":["missing_feed"]}}' }
      ]
    );
    const env = createEnv(db);

    const response = await worker.fetch(new Request("http://local/api/engines/energy/runtime"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      engineKey: string;
      feedHealth: unknown[];
      observations: Array<{ observedAt: string }>;
      ruleState: unknown[];
      triggerEvents: Array<{ triggeredAt: string }>;
      actions: Array<{ decidedAt: string; details: Record<string, unknown> | null }>;
      metadata: { readOnly: boolean; cpiEnabled: boolean; generatedAt: string };
    };

    expect(body.engineKey).toBe("energy");
    expect(body.feedHealth).toHaveLength(1);
    expect(body.observations[0]?.observedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(body.ruleState).toHaveLength(1);
    expect(body.triggerEvents[0]?.triggeredAt).toBe("2026-04-28T00:00:00.000Z");
    expect(body.actions[0]?.decidedAt).toBe("2026-04-28T00:01:00.000Z");
    expect(body.actions[0]?.details?.guardrail).toEqual({ result: "blocked", reasons: ["missing_feed"] });
    expect(body.metadata.readOnly).toBe(true);
    expect(body.metadata.cpiEnabled).toBe(false);
    expect(typeof body.metadata.generatedAt).toBe("string");
    expect(db.mutationRuns).toBe(0);
  });

  it("returns 404 stable JSON for unknown engines", async () => {
    const env = createEnv(new MockD1Database([], [], [], [], [], []));

    const response = await worker.fetch(new Request("http://local/api/engines/cpi/runtime"), env, createExecutionContext());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "not_found",
      message: "Runtime is not available for engine 'cpi'."
    });
  });

  it("rejects non-GET methods on runtime endpoints", async () => {
    const env = createEnv(new MockD1Database([], [], [], [], [], []));

    const response = await worker.fetch(
      new Request("http://local/api/engines/energy/runtime", { method: "POST" }),
      env,
      createExecutionContext()
    );

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      error: "method_not_allowed",
      message: "Method not allowed. Use GET."
    });
  });

  it("preserves existing /api/feed-health behavior", async () => {
    const env = createEnv(
      new MockD1Database(
        [
          { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", display_name: "WTI-Brent", enabled: 1 }
        ],
        [
          { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", checked_at: "2026-04-27T12:00:00.000Z", step: "save", result: "success", status: "ok", error_message: null, latency_ms: 42 }
        ],
        [],
        [],
        [],
        []
      )
    );

    const response = await worker.fetch(new Request("http://local/api/feed-health"), env, createExecutionContext());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { feeds: Array<{ feedKey: string }> };
    expect(body.feeds.map((feed) => feed.feedKey)).toEqual(["energy_spread.wti_brent_spread"]);
  });
});
