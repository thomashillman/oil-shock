import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import type { NormalizedPoint } from "../../src/types";

const { mockCollectEnergy, mockCollectMacroReleases } = vi.hoisted(() => ({
  mockCollectEnergy: vi.fn<(_: Env, __: string) => Promise<NormalizedPoint[]>>(),
  mockCollectMacroReleases: vi.fn<(_: Env, __: string) => Promise<NormalizedPoint[]>>()
}));

vi.mock("../../src/jobs/collectors/energy", () => ({
  collectEnergy: mockCollectEnergy
}));

vi.mock("../../src/jobs/collectors/macro-releases", () => ({
  collectMacroReleases: mockCollectMacroReleases
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
}

class MockD1Database {
  private nextId = 1;
  private readonly runs: Row[] = [];
  private readonly seriesPoints: Row[] = [];
  private readonly observations: Row[] = [];
  private readonly feedChecks: Row[] = [];

  constructor(private readonly failObservationWrites = false) {}

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
        details_json: params[10]
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }

    throw new Error(`Unhandled query: ${query}`);
  }

  async all<T>(query: string, _params: unknown[]): Promise<{ results: T[] }> {
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
    throw new Error(`Unhandled all query: ${query}`);
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

describe("runCollection energy dual-write", () => {
  beforeEach(() => {
    mockCollectEnergy.mockReset().mockResolvedValue(ENERGY_POINTS);
    mockCollectMacroReleases.mockReset().mockResolvedValue([]);
  });

  it("still writes Energy points to legacy series_points", async () => {
    const db = new MockD1Database();
    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    const written = await db.prepare("SELECT * FROM series_points").all<Row>();
    expect(written.results).toHaveLength(2);
  });

  it("also writes Energy points to observations", async () => {
    const db = new MockD1Database();
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
    const db = new MockD1Database();
    const env = makeEnv(db);

    await runCollection(env, new Date("2026-04-27T00:00:00.000Z"));
    await runCollection(env, new Date("2026-04-27T00:00:00.000Z"));

    const rows = await db.prepare("SELECT * FROM observations").all<Row>();
    expect(rows.results).toHaveLength(2);
  });

  it("appends feed_checks for successful Energy observation writes", async () => {
    const db = new MockD1Database();
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
    const db = new MockD1Database(true);
    const env = makeEnv(db);

    await expect(runCollection(env, new Date("2026-04-27T00:00:00.000Z"))).rejects.toThrow("observation write failed");

    const runs = await db.prepare("SELECT * FROM runs").all<Row>();
    expect(runs.results).toHaveLength(1);
    expect(runs.results[0]).toMatchObject({ status: "failed" });
  });

  it("does not invoke macro release collector", async () => {
    const db = new MockD1Database();
    await runCollection(makeEnv(db), new Date("2026-04-27T00:00:00.000Z"));

    expect(mockCollectMacroReleases).not.toHaveBeenCalled();
  });
});
