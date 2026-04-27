import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  getLatestObservation,
  insertTriggerEvent,
  recordFeedCheck,
  upsertObservation,
  upsertRuleState
} from "../../src/db/macro";
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

  async run(): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    return this.db.run(this.query, this.params);
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.query, this.params);
  }
}

class MockD1Database {
  private observations: Row[] = [];
  private feedChecks: Row[] = [];
  private ruleStates: Row[] = [];
  private triggerEvents: Row[] = [];

  prepare(query: string): MockPreparedStatement {
    return new MockPreparedStatement(this, query);
  }

  async run(query: string, params: unknown[]): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("insert into observations")) {
      const key = {
        engine_key: params[0],
        feed_key: params[1],
        series_key: params[2],
        release_key: params[3],
        as_of_date: params[4]
      };
      const existing = this.observations.find(
        (row) =>
          row.engine_key === key.engine_key &&
          row.feed_key === key.feed_key &&
          row.series_key === key.series_key &&
          row.release_key === key.release_key &&
          row.as_of_date === key.as_of_date
      );

      if (existing) {
        existing.observed_at = params[5];
        existing.value = params[6];
        existing.revised_value = params[7];
        existing.unit = params[8];
        existing.metadata_json = params[9];
      } else {
        this.observations.push({
          ...key,
          observed_at: params[5],
          value: params[6],
          revised_value: params[7],
          unit: params[8],
          metadata_json: params[9]
        });
      }

      return { success: true, meta: { last_row_id: this.observations.length } };
    }

    if (normalized.includes("insert into feed_checks")) {
      this.feedChecks.push({
        engine_key: params[0],
        feed_key: params[1],
        checked_at: params[2],
        status: params[3],
        http_status: params[4],
        latency_ms: params[5],
        error_message: params[6],
        details_json: params[7]
      });
      return { success: true, meta: { last_row_id: this.feedChecks.length } };
    }

    if (normalized.includes("insert into rule_state")) {
      const existing = this.ruleStates.find(
        (row) => row.engine_key === params[0] && row.rule_key === params[1] && row.state_key === params[2]
      );
      if (existing) {
        existing.release_key = params[3];
        existing.state_json = params[4];
        existing.evaluated_at = params[5];
      } else {
        this.ruleStates.push({
          engine_key: params[0],
          rule_key: params[1],
          state_key: params[2],
          release_key: params[3],
          state_json: params[4],
          evaluated_at: params[5]
        });
      }
      return { success: true, meta: { last_row_id: this.ruleStates.length } };
    }

    if (normalized.includes("insert or ignore into trigger_events")) {
      const exists = this.triggerEvents.some(
        (row) =>
          row.engine_key === params[0] &&
          row.rule_key === params[1] &&
          row.release_key === params[2] &&
          row.transition_key === params[3]
      );
      if (!exists) {
        this.triggerEvents.push({
          engine_key: params[0],
          rule_key: params[1],
          release_key: params[2],
          transition_key: params[3],
          previous_state: params[4],
          new_state: params[5],
          triggered_at: params[6],
          details_json: params[7]
        });
      }
      return { success: true, meta: { last_row_id: this.triggerEvents.length } };
    }

    throw new Error(`Unhandled query: ${query}`);
  }

  async first<T>(query: string, params: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from observations")) {
      const filtered = this.observations
        .filter(
          (row) => row.engine_key === params[0] && row.feed_key === params[1] && row.series_key === params[2]
        )
        .sort((a, b) => {
          const asOf = String(b.as_of_date).localeCompare(String(a.as_of_date));
          if (asOf !== 0) return asOf;
          return String(b.observed_at).localeCompare(String(a.observed_at));
        });
      return (filtered[0] as T | undefined) ?? null;
    }

    throw new Error(`Unhandled first query: ${query}`);
  }

  table(name: "observations" | "feed_checks" | "rule_state" | "trigger_events"): Row[] {
    if (name === "observations") return this.observations;
    if (name === "feed_checks") return this.feedChecks;
    if (name === "rule_state") return this.ruleStates;
    return this.triggerEvents;
  }
}

function testEnv(db: MockD1Database): Env {
  return {
    APP_ENV: "local",
    DB: db as unknown as D1Database,
    EIA_API_KEY: "",
    GIE_API_KEY: ""
  };
}

function isSqlite3Available(): boolean {
  try {
    execFileSync("sqlite3", ["--version"], { stdio: "pipe", encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

describe("macro core migration", () => {
  const skipIfNoSqlite3 = isSqlite3Available() ? it : it.skip;
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "oil-shock-macro-"));
    tempDirs.push(dir);
    return join(dir, "test.db");
  }

  function runSqlite(dbPath: string, sql: string): string {
    return execFileSync("sqlite3", [dbPath, sql], { encoding: "utf8" }).trim();
  }

  function applyMigrationFile(dbPath: string, filePath: string): void {
    execFileSync("sqlite3", [dbPath, `.read ${filePath}`], { encoding: "utf8" });
  }

  function applyAllMigrations(dbPath: string): void {
    const migrationDir = resolve(process.cwd(), "../db/migrations");
    const files = readdirSync(migrationDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      applyMigrationFile(dbPath, join(migrationDir, file));
    }
  }

  skipIfNoSqlite3("fresh migration chain creates macro core tables", () => {
    const dbPath = createDbPath();
    applyAllMigrations(dbPath);

    const tables = runSqlite(
      dbPath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('feed_registry','feed_checks','observations','rule_state','trigger_events','action_log','rendered_outputs') ORDER BY name;"
    ).split("\n");

    expect(tables).toEqual([
      "action_log",
      "feed_checks",
      "feed_registry",
      "observations",
      "rendered_outputs",
      "rule_state",
      "trigger_events"
    ]);
  });
});

describe("macro db helpers", () => {
  it("upsertObservation inserts once and does not duplicate on replay", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    const input = {
      engineKey: "energy",
      feedKey: "macro_release.us_cpi",
      seriesKey: "headline",
      releaseKey: "2026-03",
      asOfDate: "2026-03-01",
      observedAt: "2026-03-12T12:30:00.000Z",
      value: 3.4
    };

    await upsertObservation(env, input);
    await upsertObservation(env, input);

    expect(db.table("observations")).toHaveLength(1);
  });

  it("upsertObservation updates revised value or metadata without duplication", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    await upsertObservation(env, {
      engineKey: "energy",
      feedKey: "macro_release.us_cpi",
      seriesKey: "headline",
      releaseKey: "2026-03",
      asOfDate: "2026-03-01",
      observedAt: "2026-03-12T12:30:00.000Z",
      value: 3.4,
      metadata: { source: "initial" }
    });

    await upsertObservation(env, {
      engineKey: "energy",
      feedKey: "macro_release.us_cpi",
      seriesKey: "headline",
      releaseKey: "2026-03",
      asOfDate: "2026-03-01",
      observedAt: "2026-03-12T12:30:00.000Z",
      value: 3.4,
      revisedValue: 3.5,
      metadata: { source: "revised" }
    });

    const latest = await getLatestObservation(env, "energy", "macro_release.us_cpi", "headline");
    expect(db.table("observations")).toHaveLength(1);
    expect(latest?.revisedValue).toBe(3.5);
    expect(latest?.metadata).toEqual({ source: "revised" });
  });

  it("recordFeedCheck appends history", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    await recordFeedCheck(env, {
      engineKey: "energy",
      feedKey: "macro_release.us_cpi",
      checkedAt: "2026-03-12T12:30:00.000Z",
      status: "ok"
    });
    await recordFeedCheck(env, {
      engineKey: "energy",
      feedKey: "macro_release.us_cpi",
      checkedAt: "2026-03-13T12:30:00.000Z",
      status: "ok"
    });

    expect(db.table("feed_checks")).toHaveLength(2);
  });

  it("upsertRuleState overwrites same engine/rule/state key", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    await upsertRuleState(env, {
      engineKey: "energy",
      ruleKey: "energy.confirmation.spread_widening",
      stateKey: "current",
      releaseKey: "2026-03",
      state: { active: false },
      evaluatedAt: "2026-03-12T12:30:00.000Z"
    });

    await upsertRuleState(env, {
      engineKey: "energy",
      ruleKey: "energy.confirmation.spread_widening",
      stateKey: "current",
      releaseKey: "2026-03",
      state: { active: true },
      evaluatedAt: "2026-03-13T12:30:00.000Z"
    });

    const rows = db.table("rule_state");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state_json).toBe('{"active":true}');
  });

  it("insertTriggerEvent is idempotent for the same logical event", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    const event = {
      engineKey: "energy",
      ruleKey: "energy.confirmation.spread_widening",
      releaseKey: "2026-03",
      transitionKey: "inactive->active",
      previousState: "inactive",
      newState: "active",
      triggeredAt: "2026-03-12T12:30:00.000Z"
    };

    await insertTriggerEvent(env, event);
    await insertTriggerEvent(env, event);

    expect(db.table("trigger_events")).toHaveLength(1);
  });
});
