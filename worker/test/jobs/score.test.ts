import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";

const { mockRunEnergyRuleEngineV2 } = vi.hoisted(() => ({
  mockRunEnergyRuleEngineV2: vi.fn<(_: Env, __: { runKey: string; releaseKey: string; evaluatedAt: string }) => Promise<unknown>>()
}));
const { mockRunActionManagerForEngine } = vi.hoisted(() => ({
  mockRunActionManagerForEngine: vi.fn<(_: Env, __: { engineKey: string; nowIso: string }) => Promise<unknown>>()
}));
const { mockWriteOilShockCompatibilitySnapshot } = vi.hoisted(() => ({
  mockWriteOilShockCompatibilitySnapshot: vi.fn()
}));

vi.mock("../../src/core/rules/energy-v2", () => ({
  runEnergyRuleEngineV2: mockRunEnergyRuleEngineV2
}));
vi.mock("../../src/core/actions/action-manager", () => ({
  runActionManagerForEngine: mockRunActionManagerForEngine
}));
vi.mock("../../src/jobs/score-compatibility", () => ({
  writeOilShockCompatibilitySnapshot: mockWriteOilShockCompatibilitySnapshot
}));

import { runScore } from "../../src/jobs/score";

type Row = Record<string, unknown>;

// Minimal threshold seed so loadThresholds() succeeds for the live Energy score path.
const SEED_CONFIG_THRESHOLDS: Row[] = [
  { key: "state_aligned_threshold_max", value: 0.3 },
  { key: "state_mild_threshold_min", value: 0.3 },
  { key: "state_mild_threshold_max", value: 0.5 },
  { key: "state_persistent_threshold_min", value: 0.5 },
  { key: "state_persistent_threshold_max", value: 0.75 },
  { key: "state_deep_threshold_min", value: 0.75 },
  { key: "shock_age_threshold_hours", value: 72 },
  { key: "dislocation_persistence_threshold_hours", value: 72 },
  { key: "ledger_adjustment_magnitude", value: 0.1 },
  { key: "mismatch_market_response_weight", value: 0.15 },
  { key: "confirmation_physical_stress_min", value: 0.6 },
  { key: "confirmation_price_signal_max", value: 0.45 },
  { key: "confirmation_market_response_min", value: 0.5 },
  { key: "coverage_missing_penalty", value: 0.34 },
  { key: "coverage_stale_penalty", value: 0.16 },
  { key: "coverage_max_penalty", value: 1.0 },
  { key: "state_deep_persistence_hours", value: 120 },
  { key: "state_persistent_persistence_hours", value: 72 },
  { key: "ledger_stale_threshold_days", value: 30 },
  { key: "wti_brent_floor_usd", value: 3.5 },
  { key: "wti_brent_ceiling_usd", value: 15.0 },
  { key: "wti_premium_discount", value: 0.5 },
  { key: "diesel_crack_floor_usd", value: 10.0 },
  { key: "diesel_crack_ceiling_usd", value: 40.0 },
  { key: "physical_baseline_penalty_weight", value: 0.1 },
  { key: "seasonal_baseline_years", value: 5.0 },
  { key: "physical_rolling_weeks", value: 4.0 }
];

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

    if (normalized.includes("from config_thresholds")) {
      return { results: SEED_CONFIG_THRESHOLDS as T[] };
    }

    if (normalized.includes("from rules")) {
      if (this.failRulesQuery) {
        throw new Error("legacy rule evaluation failed");
      }
      const engineKey = typeof params[0] === "string" ? params[0] : null;
      const rows = this.rules.filter((row) => row.is_active === 1 && (engineKey ? row.engine_key === engineKey : true));
      return { results: rows as T[] };
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
    mockWriteOilShockCompatibilitySnapshot.mockReset().mockImplementation(
      async (_env: Env, now: Date) => ({ generatedAt: now.toISOString() })
    );
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
    expect(mockWriteOilShockCompatibilitySnapshot).toHaveBeenCalledTimes(1);
  });

  it("flags a missing price signal as provisional and lowers confidence", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 1.0, observed_at: "2026-04-28T00:00:00.000Z" }
      // no price_signal.curve_slope point
    );

    await runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"));

    expect(db.scores).toHaveLength(1);
    // hiddenMismatch = 0.7^2 * 0.5 = 0.245; transmission = 1.0 * 0.15 = 0.15; no rules => 0.395
    // (no seasonal-breach series present, so physical stress carries no baseline penalty)
    expect(Number(db.scores[0]?.score_value)).toBeCloseTo(0.395, 5);
    expect(JSON.parse(String(db.scores[0]?.flags_json))).toContain("missing_price_confirmation");
    expect(db.scores[0]?.confidence).toBe(0.6);
  });

  it("adds a physical-stress penalty for each physical feed that breached its seasonal baseline", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.5, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.0, observed_at: "2026-04-28T00:00:00.000Z" },
      // curve_slope = 1.0 (deep contango) inverts to marketRecognition = 0, so the score is the
      // pure squared physical stress.
      { series_key: "price_signal.curve_slope", value: 1.0, observed_at: "2026-04-28T00:00:00.000Z" },
      // Two physical feeds breached their seasonal baseline; the third is absent (no penalty).
      { series_key: "physical_stress.inventory_draw.seasonal_breach", value: 1, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "physical_stress.refinery_utilization.seasonal_breach", value: 1, observed_at: "2026-04-28T00:00:00.000Z" }
    );

    await runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"));

    expect(db.scores).toHaveLength(1);
    // physicalStress = clamp(0.5 + 0.1*2) = 0.7; marketRecognition = 1 - 1 = 0
    // hiddenMismatch = 0.7^2 * (1 - 0) = 0.49; transmission = 0 => 0.49
    expect(Number(db.scores[0]?.score_value)).toBeCloseTo(0.49, 5);
  });

  it("does not penalise physical stress when no seasonal-breach feeds are present", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.5, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.0, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "price_signal.curve_slope", value: 1.0, observed_at: "2026-04-28T00:00:00.000Z" }
    );

    await runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"));

    expect(db.scores).toHaveLength(1);
    // physicalStress = 0.5 (no penalty); hiddenMismatch = 0.5^2 * 1 = 0.25 => 0.25
    expect(Number(db.scores[0]?.score_value)).toBeCloseTo(0.25, 5);
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
    expect(mockWriteOilShockCompatibilitySnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps the score run successful when the compatibility snapshot write fails", async () => {
    const db = new MockD1Database();
    db.seriesPoints.push(
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.6, observed_at: "2026-04-28T00:00:00.000Z" },
      { series_key: "price_signal.curve_slope", value: 0.2, observed_at: "2026-04-28T00:00:00.000Z" }
    );

    mockWriteOilShockCompatibilitySnapshot.mockRejectedValueOnce(new Error("compatibility snapshot write failed"));

    await expect(runScore(makeEnv(db), new Date("2026-04-28T00:00:00.000Z"))).resolves.toBeUndefined();

    expect(db.runs[0]?.status).toBe("success");
    expect(JSON.parse(String(db.runs[0]?.details_json))).toMatchObject({
      message: "Macro Signals engines scored",
      compatibilitySnapshotGeneratedAt: null
    });
    expect(mockRunEnergyRuleEngineV2).toHaveBeenCalledTimes(1);
    expect(mockRunActionManagerForEngine).toHaveBeenCalledTimes(1);
    expect(mockWriteOilShockCompatibilitySnapshot).toHaveBeenCalledTimes(1);
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
    expect(mockWriteOilShockCompatibilitySnapshot).not.toHaveBeenCalled();
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
