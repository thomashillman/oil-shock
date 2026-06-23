import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";

const { mockRunEnergyRuleEngineV2 } = vi.hoisted(() => ({
  mockRunEnergyRuleEngineV2: vi.fn<(_: Env, __: { runKey: string; releaseKey: string; evaluatedAt: string }) => Promise<unknown>>()
}));
const { mockRunActionManagerForEngine } = vi.hoisted(() => ({
  mockRunActionManagerForEngine: vi.fn<(_: Env, __: { engineKey: string; nowIso: string }) => Promise<unknown>>()
}));

vi.mock("../../src/core/rules/energy-v2", () => ({
  runEnergyRuleEngineV2: mockRunEnergyRuleEngineV2
}));
vi.mock("../../src/core/actions/action-manager", () => ({
  runActionManagerForEngine: mockRunActionManagerForEngine
}));

import { runScore } from "../../src/jobs/score";

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

  async run(): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    return this.db.run(this.query, this.params);
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.query, this.params);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return this.db.all<T>(this.query, this.params);
  }
}

class MockD1Database {
  runs: Row[] = [];
  scores: Row[] = [];
  rules: Row[] = [];
  seriesPoints: Row[] = [];
  failRulesQuery = false;

  prepare(query: string): MockPreparedStatement {
    return new MockPreparedStatement(this, query);
  }

  async run(query: string, params: unknown[]): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("insert into runs")) {
      this.runs.push({ run_key: params[0], run_type: params[1], status: "running" });
      return { success: true, meta: { last_row_id: this.runs.length } };
    }

    if (normalized.startsWith("update runs")) {
      const run = this.runs.find((row) => row.run_key === params[3]);
      if (run) {
        run.status = params[0];
        run.details_json = params[2];
      }
      return { success: true, meta: { last_row_id: 0 } };
    }

    if (normalized.includes("insert into scores")) {
      this.scores.push({
        engine_key: params[0],
        feed_key: params[1],
        score_value: params[3],
        confidence: params[4],
        flags_json: params[5]
      });
      return { success: true, meta: { last_row_id: this.scores.length } };
    }

    throw new Error(`Unhandled query: ${query}`);
  }

  async first<T>(query: string, params: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from series_points") && normalized.includes("order by observed_at desc")) {
      const seriesKey = params[0];
      const match = this.seriesPoints.find((row) => row.series_key === seriesKey);
      return (match as T | undefined) ?? null;
    }

    throw new Error(`Unhandled first query: ${query}`);
  }

  async all<T>(query: string, params: unknown[]): Promise<{ results: T[] }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from rules") && normalized.includes("where engine_key = ?") && normalized.includes("is_active = 1")) {
      if (this.failRulesQuery) {
        throw new Error("legacy rule evaluation failed");
      }
      const engineKey = params[0];
      return { results: this.rules.filter((row) => row.engine_key === engineKey && row.is_active === 1) as T[] };
    }

    throw new Error(`Unhandled all query: ${query}`);
  }
}

function makeEnv(db: MockD1Database): Env {
  return {
    APP_ENV: "local",
    DB: db as unknown as D1Database,
    EIA_API_KEY: "",
    GIE_API_KEY: ""
  };
}

describe("runScore Energy compatibility with rule engine v2 bridge", () => {
  beforeEach(() => {
    mockRunEnergyRuleEngineV2.mockReset().mockResolvedValue({
      results: [
        {
          ruleKey: "energy.confirmation.spread_widening",
          status: "active",
          computed: {},
          stateUpdates: [],
          triggerEvent: { transitionKey: "inactive->active", newState: "active" }
        }
      ]
    });
    mockRunActionManagerForEngine.mockReset().mockResolvedValue({
      processedCount: 0,
      skippedCount: 0,
      allowedCount: 0,
      blockedCount: 0,
      ignoredCount: 0,
      errorCount: 0
    });
  });

  it("preserves legacy score write behavior while invoking Energy rule engine v2", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.6, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "price_signal.curve_slope", value: 0.2, observed_at: "2026-04-28T00:00:00.000Z" }
    );

    await runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"));

    expect(db.scores).toHaveLength(1);
    expect(db.scores[0]?.engine_key).toBe("energy");
    expect(mockRunEnergyRuleEngineV2).toHaveBeenCalledTimes(1);
    expect(mockRunActionManagerForEngine).toHaveBeenCalledTimes(1);
  });

  it("does not invoke action manager when rule engine v2 reports no trigger events", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.6, observed_at: "2026-04-28T00:00:00.000Z" }
    );
    mockRunEnergyRuleEngineV2.mockResolvedValue({ results: [] });

    await runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"));

    expect(mockRunActionManagerForEngine).not.toHaveBeenCalled();
  });

  it("fails the scoring run when rule engine v2 persistence fails", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.6, observed_at: "2026-04-28T00:00:00.000Z" }
    );

    mockRunEnergyRuleEngineV2.mockRejectedValue(new Error("rule_state write failed"));

    await expect(runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"))).rejects.toThrow("rule_state write failed");

    expect(db.runs[0]?.status).toBe("failed");
    expect(mockRunActionManagerForEngine).not.toHaveBeenCalled();
  });

  it("skips rule engine v2 when legacy energy scoring fails", async () => {
    const db = new MockD1Database();
    db.failRulesQuery = true;
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.6, observed_at: "2026-04-28T00:00:00.000Z" }
    );

    await runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"));

    expect(db.scores).toHaveLength(0);
    expect(mockRunEnergyRuleEngineV2).not.toHaveBeenCalled();
    expect(mockRunActionManagerForEngine).not.toHaveBeenCalled();
  });

  it("fails closed when action manager persistence fails", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.6, observed_at: "2026-04-28T00:00:00.000Z" }
    );
    mockRunActionManagerForEngine.mockRejectedValue(new Error("action_log write failed"));

    await expect(runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"))).rejects.toThrow("action_log write failed");
    expect(db.runs[0]?.status).toBe("failed");
  });
});
