import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import type { NormalizedPoint } from "../../src/types";
import type { CpiObservationCandidate } from "../../src/jobs/collectors/cpi";

const { mockCollectEnergy, mockCollectCpi } = vi.hoisted(() => ({
  mockCollectEnergy: vi.fn<(_: Env, __: string) => Promise<NormalizedPoint[]>>(),
  mockCollectCpi: vi.fn<(_: Env, __: string) => Promise<CpiObservationCandidate[]>>()
}));

vi.mock("../../src/jobs/collectors/energy", () => ({
  collectEnergy: mockCollectEnergy
}));

vi.mock("../../src/jobs/collectors/cpi", () => ({
  collectCpi: mockCollectCpi
}));

import { runCollection } from "../../src/jobs/collect";

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

  async all<T>(): Promise<{ results: T[] }> {
    return this.db.all<T>(this.query, this.params);
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.query, this.params);
  }
}

class MockD1Database {
  private nextId = 1;
  private readonly runs: Row[] = [];
  private readonly seriesPoints: Row[] = [];
  private readonly observations: Row[] = [];
  private readonly feedChecks: Row[] = [];
  private readonly feedRegistry: Row[];
  private readonly triggerEvents: Row[] = [];
  private readonly ruleState: Row[] = [];
  private readonly actionLog: Row[] = [];

  constructor(options?: { failObservationWrites?: boolean; feedRegistry?: Row[] }) {
    this.failObservationWrites = options?.failObservationWrites ?? false;
    this.feedRegistry = [...(options?.feedRegistry ?? [])];
  }

  private readonly failObservationWrites: boolean;

  prepare(query: string): MockPreparedStatement {
    return new MockPreparedStatement(this, query);
  }

  async run(query: string, params: unknown[]): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("insert into runs")) {
      this.runs.push({ id: this.nextId++, run_key: params[0], status: "running", run_type: params[1] });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }

    if (normalized.startsWith("update runs")) {
      const run = this.runs.find((row) => row.run_key === params[3]);
      if (run) {
        run.status = params[0];
        run.details_json = params[2];
      }
      return { success: true, meta: { last_row_id: 0 } };
    }

    if (normalized.includes("insert into series_points")) {
      this.seriesPoints.push({
        id: this.nextId++,
        series_key: params[0],
        observed_at: params[1],
        value: params[2],
        unit: params[3],
        source_key: params[4]
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }

    if (normalized.includes("insert into observations")) {
      if (this.failObservationWrites) {
        throw new Error("observation write failed");
      }

      const existing = this.observations.find(
        (row) =>
          row.engine_key === params[0] &&
          row.feed_key === params[1] &&
          row.series_key === params[2] &&
          row.release_key === params[3] &&
          row.as_of_date === params[4]
      );

      if (existing) {
        existing.observed_at = params[5];
        existing.value = params[6];
        existing.run_key = params[11];
        existing.metadata_json = params[13];
      } else {
        this.observations.push({
          id: this.nextId++,
          engine_key: params[0],
          feed_key: params[1],
          series_key: params[2],
          release_key: params[3],
          as_of_date: params[4],
          observed_at: params[5],
          value: params[6],
          run_key: params[11],
          metadata_json: params[13]
        });
      }
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }

    if (normalized.includes("insert into feed_checks")) {
      this.feedChecks.push({
        id: this.nextId++,
        engine_key: params[0],
        feed_key: params[1],
        run_key: params[2],
        step: params[3],
        result: params[4],
        checked_at: params[5],
        status: params[6],
        details_json: params[10],
        error_message: params[9]
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }

    if (normalized.includes("insert into feed_registry")) {
      this.feedRegistry.push({
        id: this.nextId++,
        engine_key: params[0],
        feed_key: params[1],
        enabled: params[2]
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }

    throw new Error(`Unhandled query: ${query}`);
  }

  async all<T>(query: string, params: unknown[]): Promise<{ results: T[] }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from series_points")) {
      return { results: this.seriesPoints as T[] };
    }
    if (normalized.includes("from observations")) {
      return { results: this.observations as T[] };
    }
    if (normalized.includes("from feed_checks")) {
      return { results: this.feedChecks as T[] };
    }
    if (normalized.includes("from runs")) {
      return { results: this.runs as T[] };
    }
    if (normalized.includes("from trigger_events")) {
      return { results: this.triggerEvents as T[] };
    }
    if (normalized.includes("from rule_state")) {
      return { results: this.ruleState as T[] };
    }
    if (normalized.includes("from action_log")) {
      return { results: this.actionLog as T[] };
    }
    if (normalized.includes("from feed_registry") && normalized.includes("enabled = 1")) {
      const engineKey = params[0];
      return { results: this.feedRegistry.filter((row) => row.engine_key === engineKey && row.enabled === 1) as T[] };
    }
    if (normalized.includes("from feed_registry") && normalized.includes("order by feed_key")) {
      const engineKey = params[0];
      return { results: this.feedRegistry.filter((row) => row.engine_key === engineKey) as T[] };
    }
    throw new Error(`Unhandled all query: ${query}`);
  }

  async first<T>(query: string, params: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("select count(*) as count from feed_registry")) {
      const engineKey = params[0];
      const count = this.feedRegistry.filter((row) => row.engine_key === engineKey).length;
      return { count } as T;
    }
    throw new Error(`Unhandled first query: ${query}`);
  }
}

function makeEnv(db: MockD1Database): Env {
  return {
    APP_ENV: "local",
    DB: db as unknown as D1Database,
    EIA_API_KEY: "test",
    GIE_API_KEY: "test"
  };
}

const ENERGY_POINTS: NormalizedPoint[] = [
  {
    seriesKey: "energy_spread.wti_brent_spread",
    observedAt: "2026-04-24",
    value: 0.31,
    unit: "index",
    sourceKey: "energy"
  },
  {
    seriesKey: "energy_spread.diesel_wti_crack",
    observedAt: "2026-04-24",
    value: 0.44,
    unit: "index",
    sourceKey: "energy"
  }
];

const CPI_OBSERVATION: CpiObservationCandidate = {
  engineKey: "cpi",
  feedKey: "macro_release.us_cpi.all_items_index",
  seriesKey: "macro_release.us_cpi.all_items_index",
  releaseKey: "cpi:2026-04",
  asOfDate: "2026-04",
  observedAt: "2026-05-12T12:30:00.000Z",
  value: 316.582,
  unit: "index",
  metadata: {
    provider: "BLS",
    sourceSeriesId: "CUUR0000SA0",
    bridge: "cpi_collect_only_v1"
  }
};

describe("runCollection energy dual-write", () => {
  beforeEach(() => {
    mockCollectEnergy.mockReset().mockResolvedValue(ENERGY_POINTS);
    mockCollectCpi.mockReset().mockResolvedValue([CPI_OBSERVATION]);
  });

  it("still writes Energy points to legacy series_points", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 }
      ]
    });
    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const written = await db.prepare("SELECT * FROM series_points").all<Row>();
    expect(written.results).toHaveLength(2);
  });

  it("also writes Energy points to observations", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 }
      ]
    });
    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const rows = await db.prepare("SELECT * FROM observations").all<Row>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]).toMatchObject({
      engine_key: "energy",
      feed_key: "energy_spread.wti_brent_spread",
      series_key: "energy_spread.wti_brent_spread"
    });
  });

  it("is idempotent for observations across repeated collection runs", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 }
      ]
    });
    const env = makeEnv(db);

    await runCollection(env, new Date("2026-04-27T00:00:00.000Z"));
    await runCollection(env, new Date("2026-04-27T00:00:00.000Z"));

    const rows = await db.prepare("SELECT * FROM observations").all<Row>();
    expect(rows.results).toHaveLength(2);
  });

  it("appends feed_checks for successful Energy observation writes", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 }
      ]
    });
    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const rows = await db.prepare("SELECT * FROM feed_checks").all<Row>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]).toMatchObject({
      engine_key: "energy",
      step: "save_observation",
      result: "success",
      status: "ok"
    });
  });

  it("marks run failed and rethrows when observation write fails", async () => {
    const db = new MockD1Database({ failObservationWrites: true });
    const env = makeEnv(db);

    await expect(runCollection(env, new Date("2026-04-27T00:00:00.000Z"))).rejects.toThrow("observation write failed");

    const runs = await db.prepare("SELECT * FROM runs").all<Row>();
    expect(runs.results).toHaveLength(1);
    expect(runs.results[0]).toMatchObject({ status: "failed" });
  });


  it("keeps prior semantics when Energy collector fails by completing run without throwing", async () => {
    mockCollectEnergy.mockRejectedValueOnce(new Error("energy upstream failed"));
    const db = new MockD1Database();

    await expect(runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"))).resolves.toBeUndefined();

    const seriesPoints = await db.prepare("SELECT * FROM series_points").all<Row>();
    expect(seriesPoints.results).toHaveLength(0);

    const observations = await db.prepare("SELECT * FROM observations").all<Row>();
    expect(observations.results).toHaveLength(0);

    const runs = await db.prepare("SELECT * FROM runs").all<Row>();
    expect(runs.results).toHaveLength(1);
    expect(runs.results[0]).toMatchObject({ status: "success" });
  });
  it("skips disabled feeds for observations and feed_checks while preserving legacy writes", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 0 }
      ]
    });

    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const legacy = await db.prepare("SELECT * FROM series_points").all<Row>();
    expect(legacy.results).toHaveLength(2);

    const observations = await db.prepare("SELECT * FROM observations").all<Row>();
    expect(observations.results).toHaveLength(1);
    expect(observations.results[0]?.feed_key).toBe("energy_spread.wti_brent_spread");

    const checks = await db.prepare("SELECT * FROM feed_checks").all<Row>();
    expect(checks.results).toHaveLength(1);
    expect(checks.results[0]?.feed_key).toBe("energy_spread.wti_brent_spread");
  });

  it("falls back to writing all Energy observations when registry has no Energy rows", async () => {
    const db = new MockD1Database({
      feedRegistry: [{ engine_key: "other", feed_key: "other.feed", enabled: 1 }]
    });

    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const observations = await db.prepare("SELECT * FROM observations").all<Row>();
    expect(observations.results).toHaveLength(2);

    const checks = await db.prepare("SELECT * FROM feed_checks").all<Row>();
    expect(checks.results).toHaveLength(2);
  });

  it("does not write CPI observations or success feed checks when CPI feed is disabled", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 },
        { engine_key: "cpi", feed_key: "macro_release.us_cpi.all_items_index", enabled: 0 }
      ]
    });

    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const cpiObservations = (await db.prepare("SELECT * FROM observations").all<Row>()).results.filter(
      (row) => row.engine_key === "cpi"
    );
    expect(cpiObservations).toHaveLength(0);

    const cpiFeedChecks = (await db.prepare("SELECT * FROM feed_checks").all<Row>()).results.filter(
      (row) => row.engine_key === "cpi"
    );
    expect(cpiFeedChecks).toHaveLength(0);
    expect(mockCollectCpi).not.toHaveBeenCalled();
  });

  it("writes CPI observations and success feed checks when CPI feed is enabled", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 },
        { engine_key: "cpi", feed_key: "macro_release.us_cpi.all_items_index", enabled: 1 }
      ]
    });

    const env = makeEnv(db);
    await runCollection(env, new Date("2026-04-27T00:00:00.000Z"));
    await runCollection(env, new Date("2026-04-27T00:00:00.000Z"));

    const observations = (await db.prepare("SELECT * FROM observations").all<Row>()).results;
    const cpiObservations = observations.filter((row) => row.engine_key === "cpi");
    expect(cpiObservations).toHaveLength(1);
    expect(cpiObservations[0]).toMatchObject({
      feed_key: "macro_release.us_cpi.all_items_index",
      release_key: "cpi:2026-04"
    });

    const checks = (await db.prepare("SELECT * FROM feed_checks").all<Row>()).results;
    const cpiChecks = checks.filter((row) => row.engine_key === "cpi");
    expect(cpiChecks).toHaveLength(2);
    expect(cpiChecks[0]).toMatchObject({ result: "success", status: "ok" });
  });

  it("records CPI error feed_check when CPI collection fails", async () => {
    mockCollectCpi.mockRejectedValueOnce(new Error("cpi fixture parse failed"));
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 },
        { engine_key: "cpi", feed_key: "macro_release.us_cpi.all_items_index", enabled: 1 }
      ]
    });

    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const checks = (await db.prepare("SELECT * FROM feed_checks").all<Row>()).results;
    const cpiChecks = checks.filter((row) => row.engine_key === "cpi");
    expect(cpiChecks).toHaveLength(1);
    expect(cpiChecks[0]).toMatchObject({
      feed_key: "macro_release.us_cpi.all_items_index",
      result: "error",
      status: "error",
      error_message: "cpi fixture parse failed"
    });
  });

  it("keeps CPI collect-only and does not write rule_state, trigger_events, or action_log rows", async () => {
    const db = new MockD1Database({
      feedRegistry: [
        { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
        { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 1 },
        { engine_key: "cpi", feed_key: "macro_release.us_cpi.all_items_index", enabled: 1 }
      ]
    });

    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    await expect(db.prepare("SELECT * FROM rule_state").all<Row>()).resolves.toEqual({ results: [] });
    await expect(db.prepare("SELECT * FROM trigger_events").all<Row>()).resolves.toEqual({ results: [] });
    await expect(db.prepare("SELECT * FROM action_log").all<Row>()).resolves.toEqual({ results: [] });
  });
});
