import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  getFeedHealthSummary,
  getLatestFeedChecks,
  getLatestObservation,
  getRuleState,
  hasActionLogDecisionForKey,
  hasActionLogDecisionForRuleRelease,
  insertActionLog,
  insertRenderedOutput,
  insertTriggerEvent,
  listRuntimeActions,
  listRuntimeObservations,
  listRuntimeRuleState,
  listRuntimeTriggerEvents,
  listConfirmedTriggerEvents,
  listUnloggedConfirmedTriggerEvents,
  listLatestObservationsForEngine,
  listEnabledFeedKeys,
  listRegisteredFeeds,
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

  async all<T>(): Promise<{ results: T[] }> {
    return this.db.all<T>(this.query, this.params);
  }
}

class MockD1Database {
  private observations: Row[] = [];
  private feedChecks: Row[] = [];
  private feedRegistry: Row[] = [];
  private ruleStates: Row[] = [];
  private triggerEvents: Row[] = [];
  private actionLogs: Row[] = [];
  private renderedOutputs: Row[] = [];

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
        existing.latency_tag = params[8];
        existing.source_hash = params[9];
        existing.r2_artifact_key = params[10];
        existing.run_key = params[11];
        existing.unit = params[12];
        existing.metadata_json = params[13];
      } else {
        this.observations.push({
          ...key,
          observed_at: params[5],
          value: params[6],
          revised_value: params[7],
          latency_tag: params[8],
          source_hash: params[9],
          r2_artifact_key: params[10],
          run_key: params[11],
          unit: params[12],
          metadata_json: params[13]
        });
      }

      return { success: true, meta: { last_row_id: this.observations.length } };
    }

    if (normalized.includes("insert into feed_checks")) {
      this.feedChecks.push({
        engine_key: params[0],
        feed_key: params[1],
        run_key: params[2],
        step: params[3],
        result: params[4],
        checked_at: params[5],
        status: params[6],
        http_status: params[7],
        latency_ms: params[8],
        error_message: params[9],
        details_json: params[10]
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
          status: params[6],
          reason: params[7],
          run_key: params[8],
          triggered_at: params[9],
          computed_json: params[10],
          details_json: params[11]
        });
      }
      return { success: true, meta: { last_row_id: this.triggerEvents.length } };
    }

    if (normalized.includes("insert or ignore into action_log")) {
      const exists = this.actionLogs.some((row) => row.engine_key === params[0] && row.decision_key === params[3]);
      if (!exists) {
        this.actionLogs.push({
          engine_key: params[0],
          rule_key: params[1],
          release_key: params[2],
          decision_key: params[3],
          decision: params[4],
          action_type: params[5],
          rationale: params[6],
          decided_at: params[7],
          details_json: params[8]
        });
      }
      return { success: true, meta: { last_row_id: this.actionLogs.length } };
    }

    if (normalized.includes("insert or ignore into rendered_outputs")) {
      const exists = this.renderedOutputs.some(
        (row) => row.engine_key === params[0] && row.output_idempotency_key === params[2]
      );
      if (!exists) {
        this.renderedOutputs.push({
          engine_key: params[0],
          output_key: params[1],
          output_idempotency_key: params[2],
          release_key: params[3],
          markdown_body: params[4],
          content_json: params[5],
          rendered_at: params[6],
          metadata_json: params[7]
        });
      }
      return { success: true, meta: { last_row_id: this.renderedOutputs.length } };
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

    if (normalized.includes("select count(*) as count from feed_registry")) {
      const engineKey = params[0];
      const count = this.feedRegistry.filter((row) => row.engine_key === engineKey).length;
      return { count } as T;
    }
    if (normalized.includes("from rule_state")) {
      const row = this.ruleStates.find(
        (item) => item.engine_key === params[0] && item.rule_key === params[1] && item.state_key === params[2]
      );
      return (row as T | undefined) ?? null;
    }

    if (normalized.includes("from action_log") && normalized.includes("decision_key = ?")) {
      const row = this.actionLogs.find((item) => item.engine_key === params[0] && item.decision_key === params[1]);
      return (row as T | undefined) ?? null;
    }

    if (normalized.includes("from action_log") && normalized.includes("rule_key = ?") && normalized.includes("decision_key <> ?")) {
      const row = this.actionLogs.find(
        (item) =>
          item.engine_key === params[0] &&
          item.rule_key === params[1] &&
          item.release_key === params[2] &&
          item.decision_key !== params[3]
      );
      return (row as T | undefined) ?? null;
    }

    throw new Error(`Unhandled first query: ${query}`);
  }

  async all<T>(query: string, params: unknown[]): Promise<{ results: T[] }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from observations") && normalized.includes("series_key in")) {
      const engineKey = params[0];
      const keys = new Set(params.slice(1).map((value) => String(value)));
      return {
        results: this.observations
          .filter((row) => row.engine_key === engineKey && keys.has(String(row.series_key)))
          .sort((a, b) => {
            const bySeries = String(a.series_key).localeCompare(String(b.series_key));
            if (bySeries !== 0) return bySeries;
            const byAsOf = String(b.as_of_date).localeCompare(String(a.as_of_date));
            if (byAsOf !== 0) return byAsOf;
            return String(b.observed_at).localeCompare(String(a.observed_at));
          }) as T[]
      };
    }
    if (normalized.includes("from observations") && normalized.includes("order by observed_at desc")) {
      const engineKey = params[0];
      const limit = Number(params[1]);
      return {
        results: this.observations
          .filter((row) => row.engine_key === engineKey)
          .sort((a, b) => {
            const observed = String(b.observed_at).localeCompare(String(a.observed_at));
            if (observed !== 0) return observed;
            const asOf = String(b.as_of_date).localeCompare(String(a.as_of_date));
            if (asOf !== 0) return asOf;
            return String(a.series_key).localeCompare(String(b.series_key));
          })
          .slice(0, limit) as T[]
      };
    }
    if (normalized.includes("from feed_registry") && normalized.includes("enabled = 1")) {
      const engineKey = params[0];
      return {
        results: this.feedRegistry.filter((row) => row.engine_key === engineKey && row.enabled === 1) as T[]
      };
    }
    if (normalized.includes("from feed_registry") && normalized.includes("order by feed_key")) {
      const engineKey = params[0];
      return {
        results: this.feedRegistry
          .filter((row) => row.engine_key === engineKey)
          .sort((a, b) => String(a.feed_key).localeCompare(String(b.feed_key))) as T[]
      };
    }
    if (normalized.includes("from feed_checks") && normalized.includes("order by checked_at desc")) {
      const engineKey = params[0];
      return {
        results: this.feedChecks
          .filter((row) => row.engine_key === engineKey)
          .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at))) as T[]
      };
    }
    if (normalized.includes("from trigger_events") && normalized.includes("status = 'confirmed'") && normalized.includes("(? = 0 or rule_key = ?)")) {
      const engineKey = params[0];
      const includeRuleFilter = Number(params[1]) === 1;
      const ruleKey = params[2];
      return {
        results: this.triggerEvents
          .filter(
            (row) =>
              row.engine_key === engineKey &&
              row.status === "confirmed" &&
              (!includeRuleFilter || row.rule_key === ruleKey)
          )
          .sort((a, b) => String(b.triggered_at).localeCompare(String(a.triggered_at))) as T[]
      };
    }
    if (normalized.includes("from rule_state") && normalized.includes("order by evaluated_at desc")) {
      const engineKey = params[0];
      const limit = Number(params[1]);
      return {
        results: this.ruleStates
          .filter((row) => row.engine_key === engineKey)
          .sort((a, b) => {
            const evaluated = String(b.evaluated_at).localeCompare(String(a.evaluated_at));
            if (evaluated !== 0) return evaluated;
            const rule = String(a.rule_key).localeCompare(String(b.rule_key));
            if (rule !== 0) return rule;
            return String(a.state_key).localeCompare(String(b.state_key));
          })
          .slice(0, limit) as T[]
      };
    }
    if (normalized.includes("from trigger_events") && normalized.includes("order by triggered_at desc") && normalized.includes("limit ?")) {
      const engineKey = params[0];
      const limit = Number(params[1]);
      return {
        results: this.triggerEvents
          .filter((row) => row.engine_key === engineKey)
          .sort((a, b) => String(b.triggered_at).localeCompare(String(a.triggered_at)))
          .slice(0, limit) as T[]
      };
    }
    if (normalized.includes("from action_log") && normalized.includes("order by decided_at desc")) {
      const engineKey = params[0];
      const limit = Number(params[1]);
      return {
        results: this.actionLogs
          .filter((row) => row.engine_key === engineKey)
          .sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)))
          .slice(0, limit) as T[]
      };
    }
    if (normalized.includes("from trigger_events te") && normalized.includes("left join action_log al")) {
      const engineKey = params[0];
      const existingDecisionKeys = new Set(
        this.actionLogs
          .filter((row) => row.engine_key === engineKey)
          .map((row) => String(row.decision_key))
      );
      return {
        results: this.triggerEvents
          .filter((row) => {
            if (row.engine_key !== engineKey || row.status !== "confirmed") {
              return false;
            }
            const decisionKey = `${row.engine_key}:${row.rule_key}:${row.release_key}:${row.transition_key}`;
            return !existingDecisionKeys.has(decisionKey);
          })
          .sort((a, b) => String(b.triggered_at).localeCompare(String(a.triggered_at))) as T[]
      };
    }

    throw new Error(`Unhandled all query: ${query}`);
  }

  table(
    name: "observations" | "feed_checks" | "feed_registry" | "rule_state" | "trigger_events" | "action_log" | "rendered_outputs"
  ): Row[] {
    if (name === "observations") return this.observations;
    if (name === "feed_checks") return this.feedChecks;
    if (name === "feed_registry") return this.feedRegistry;
    if (name === "rule_state") return this.ruleStates;
    if (name === "trigger_events") return this.triggerEvents;
    if (name === "action_log") return this.actionLogs;
    return this.renderedOutputs;
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

  skipIfNoSqlite3("0018 seed migration inserts Energy registry rows idempotently", () => {
    const dbPath = createDbPath();
    applyAllMigrations(dbPath);

    const migrationPath = resolve(process.cwd(), "../db/migrations/0018_seed_energy_feed_registry.sql");
    applyMigrationFile(dbPath, migrationPath);

    const seededRows = runSqlite(
      dbPath,
      "SELECT engine_key || ':' || feed_key FROM feed_registry WHERE engine_key = 'energy' ORDER BY feed_key;"
    ).split("\n");
    expect(seededRows).toEqual([
      "energy:energy_spread.diesel_wti_crack",
      "energy:energy_spread.wti_brent_spread"
    ]);

    const seededCount = runSqlite(
      dbPath,
      "SELECT COUNT(*) FROM feed_registry WHERE engine_key = 'energy' AND feed_key IN ('energy_spread.wti_brent_spread', 'energy_spread.diesel_wti_crack');"
    );
    expect(seededCount).toBe("2");
  });

  skipIfNoSqlite3("trigger_events unique key prevents duplicates for same transition identity", () => {
    const dbPath = createDbPath();
    applyAllMigrations(dbPath);

    runSqlite(
      dbPath,
      `
      INSERT INTO trigger_events (engine_key, rule_key, release_key, transition_key, new_state, triggered_at)
      VALUES ('energy', 'energy.confirmation.spread_widening', '2026-04-28', 'inactive->active', 'active', '2026-04-28T00:00:00.000Z');
      `
    );

    runSqlite(
      dbPath,
      `
      INSERT OR IGNORE INTO trigger_events (engine_key, rule_key, release_key, transition_key, new_state, triggered_at)
      VALUES ('energy', 'energy.confirmation.spread_widening', '2026-04-28', 'inactive->active', 'active', '2026-04-28T00:00:00.000Z');
      `
    );

    const count = runSqlite(
      dbPath,
      `
      SELECT COUNT(*) FROM trigger_events
      WHERE engine_key = 'energy'
        AND rule_key = 'energy.confirmation.spread_widening'
        AND release_key = '2026-04-28'
        AND transition_key = 'inactive->active';
      `
    );

    expect(count).toBe("1");
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

  it("upsertObservation persists latencyTag, sourceHash, r2ArtifactKey, and runKey", async () => {
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
      latencyTag: "slow",
      sourceHash: "hash-1",
      r2ArtifactKey: "r2://macro/1",
      runKey: "run-123"
    });

    const latest = await getLatestObservation(env, "energy", "macro_release.us_cpi", "headline");
    expect(latest?.latencyTag).toBe("slow");
    expect(latest?.sourceHash).toBe("hash-1");
    expect(latest?.r2ArtifactKey).toBe("r2://macro/1");
    expect(latest?.runKey).toBe("run-123");
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

  it("recordFeedCheck persists runKey, step, and result", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    await recordFeedCheck(env, {
      engineKey: "energy",
      feedKey: "macro_release.us_cpi",
      runKey: "run-123",
      step: "parse",
      result: "failed",
      checkedAt: "2026-03-12T12:30:00.000Z",
      status: "error"
    });

    const rows = db.table("feed_checks");
    expect(rows[0]?.run_key).toBe("run-123");
    expect(rows[0]?.step).toBe("parse");
    expect(rows[0]?.result).toBe("failed");
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

  it("listConfirmedTriggerEvents filters by engine/rule and returns newest first", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("trigger_events").push(
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-28",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "newest",
        run_key: "run-2",
        triggered_at: "2026-04-28T00:00:00.000Z",
        computed_json: null,
        details_json: "{}"
      },
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-27",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "older",
        run_key: "run-1",
        triggered_at: "2026-04-27T00:00:00.000Z",
        computed_json: null,
        details_json: "{}"
      },
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-26",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "pending",
        reason: "not-confirmed",
        run_key: "run-0",
        triggered_at: "2026-04-26T00:00:00.000Z",
        computed_json: null,
        details_json: "{}"
      },
      {
        engine_key: "other",
        rule_key: "other.rule",
        release_key: "2026-04-28",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "wrong-engine",
        run_key: "run-3",
        triggered_at: "2026-04-28T00:00:00.000Z",
        computed_json: null,
        details_json: "{}"
      }
    );

    const events = await listConfirmedTriggerEvents(env, "energy", "energy.confirmation.spread_widening");
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.releaseKey)).toEqual(["2026-04-28", "2026-04-27"]);
  });

  it("listUnloggedConfirmedTriggerEvents excludes already logged trigger events", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("trigger_events").push(
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-28",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "new",
        run_key: "run-2",
        triggered_at: "2026-04-28T00:00:00.000Z",
        computed_json: null,
        details_json: "{}"
      },
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-27",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "already-logged",
        run_key: "run-1",
        triggered_at: "2026-04-27T00:00:00.000Z",
        computed_json: null,
        details_json: "{}"
      }
    );
    db.table("action_log").push({
      engine_key: "energy",
      decision_key: "energy:energy.confirmation.spread_widening:2026-04-27:inactive->active",
      decision: "allowed",
      action_type: "log_only",
      decided_at: "2026-04-27T00:01:00.000Z"
    });

    const events = await listUnloggedConfirmedTriggerEvents(env, "energy");
    expect(events).toHaveLength(1);
    expect(events[0]?.releaseKey).toBe("2026-04-28");
  });

  it("listConfirmedTriggerEvents throws contextual error for malformed computed_json", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("trigger_events").push({
      engine_key: "energy",
      rule_key: "energy.confirmation.spread_widening",
      release_key: "2026-04-28",
      transition_key: "inactive->active",
      previous_state: "inactive",
      new_state: "active",
      status: "confirmed",
      reason: "bad-computed",
      run_key: "run-1",
      triggered_at: "2026-04-28T00:00:00.000Z",
      computed_json: "{invalid",
      details_json: "{}"
    });

    await expect(listConfirmedTriggerEvents(env, "energy")).rejects.toThrow(
      "Failed to parse trigger_events computed_json for engineKey=energy ruleKey=energy.confirmation.spread_widening releaseKey=2026-04-28 transitionKey=inactive->active"
    );
  });

  it("listConfirmedTriggerEvents throws contextual error for malformed details_json", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("trigger_events").push({
      engine_key: "energy",
      rule_key: "energy.confirmation.spread_widening",
      release_key: "2026-04-28",
      transition_key: "inactive->active",
      previous_state: "inactive",
      new_state: "active",
      status: "confirmed",
      reason: "bad-details",
      run_key: "run-1",
      triggered_at: "2026-04-28T00:00:00.000Z",
      computed_json: "{}",
      details_json: "{invalid"
    });

    await expect(listConfirmedTriggerEvents(env, "energy")).rejects.toThrow(
      "Failed to parse trigger_events details_json for engineKey=energy ruleKey=energy.confirmation.spread_widening releaseKey=2026-04-28 transitionKey=inactive->active"
    );
  });

  it("listConfirmedTriggerEvents supports valid and null trigger-event JSON fields", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("trigger_events").push(
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-28",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "with-json",
        run_key: "run-1",
        triggered_at: "2026-04-28T00:00:00.000Z",
        computed_json: '{"spread":0.72}',
        details_json: '{"source":"rule-engine"}'
      },
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-27",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "with-null",
        run_key: "run-0",
        triggered_at: "2026-04-27T00:00:00.000Z",
        computed_json: null,
        details_json: null
      }
    );

    const events = await listConfirmedTriggerEvents(env, "energy");
    expect(events[0]?.computed).toEqual({ spread: 0.72 });
    expect(events[0]?.details).toEqual({ source: "rule-engine" });
    expect(events[1]?.computed).toBeNull();
    expect(events[1]?.details).toBeNull();
  });

  it("listLatestObservationsForEngine returns newest observation per requested series", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    await upsertObservation(env, {
      engineKey: "energy",
      feedKey: "energy_spread.wti_brent_spread",
      seriesKey: "energy_spread.wti_brent_spread",
      releaseKey: "2026-04-27",
      asOfDate: "2026-04-27",
      observedAt: "2026-04-27T00:00:00.000Z",
      value: 0.4
    });
    await upsertObservation(env, {
      engineKey: "energy",
      feedKey: "energy_spread.wti_brent_spread",
      seriesKey: "energy_spread.wti_brent_spread",
      releaseKey: "2026-04-28",
      asOfDate: "2026-04-28",
      observedAt: "2026-04-28T00:00:00.000Z",
      value: 0.8
    });
    await upsertObservation(env, {
      engineKey: "energy",
      feedKey: "energy_spread.diesel_wti_crack",
      seriesKey: "energy_spread.diesel_wti_crack",
      releaseKey: "2026-04-28",
      asOfDate: "2026-04-28",
      observedAt: "2026-04-28T00:00:00.000Z",
      value: 0.7
    });

    const latest = await listLatestObservationsForEngine(env, "energy", [
      "energy_spread.wti_brent_spread",
      "energy_spread.diesel_wti_crack"
    ]);

    expect(latest["energy_spread.wti_brent_spread"]?.value).toBe(0.8);
    expect(latest["energy_spread.diesel_wti_crack"]?.value).toBe(0.7);
  });

  it("listRuntimeObservations filters by engine, orders newest-first, and respects limit", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("observations").push(
      {
        engine_key: "energy",
        feed_key: "energy_spread.wti_brent_spread",
        series_key: "energy_spread.wti_brent_spread",
        release_key: "2026-04-27",
        as_of_date: "2026-04-27",
        observed_at: "2026-04-27T00:00:00.000Z",
        value: 0.4
      },
      {
        engine_key: "energy",
        feed_key: "energy_spread.wti_brent_spread",
        series_key: "energy_spread.wti_brent_spread",
        release_key: "2026-04-28",
        as_of_date: "2026-04-28",
        observed_at: "2026-04-28T00:00:00.000Z",
        value: 0.8
      },
      {
        engine_key: "cpi",
        feed_key: "macro_release.us_cpi",
        series_key: "macro_release.us_cpi",
        release_key: "2026-04",
        as_of_date: "2026-04-12",
        observed_at: "2026-04-12T13:30:00.000Z",
        value: 2.9
      }
    );

    const rows = await listRuntimeObservations(env, "energy", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.engineKey).toBe("energy");
    expect(rows[0]?.observedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("listRuntimeRuleState parses JSON, filters by engine, orders deterministically, and respects limit", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("rule_state").push(
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        state_key: "current",
        release_key: "2026-04-28",
        state_json: '{"status":"active"}',
        evaluated_at: "2026-04-28T00:00:00.000Z"
      },
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        state_key: "previous",
        release_key: "2026-04-27",
        state_json: '{"status":"inactive"}',
        evaluated_at: "2026-04-27T00:00:00.000Z"
      },
      {
        engine_key: "cpi",
        rule_key: "cpi.surprise",
        state_key: "current",
        release_key: "2026-04",
        state_json: '{"status":"active"}',
        evaluated_at: "2026-04-12T13:30:00.000Z"
      }
    );

    const rows = await listRuntimeRuleState(env, "energy", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toEqual({ status: "active" });
  });

  it("listRuntimeRuleState throws contextual error for malformed state_json", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("rule_state").push({
      engine_key: "energy",
      rule_key: "energy.confirmation.spread_widening",
      state_key: "current",
      release_key: "2026-04-28",
      state_json: "{invalid",
      evaluated_at: "2026-04-28T00:00:00.000Z"
    });

    await expect(listRuntimeRuleState(env, "energy", 25)).rejects.toThrow(
      "Failed to parse rule_state state_json for engineKey=energy ruleKey=energy.confirmation.spread_widening stateKey=current"
    );
  });

  it("listRuntimeTriggerEvents filters by engine, orders newest-first, and applies limit", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("trigger_events").push(
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-28",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "newer",
        run_key: "run-2",
        triggered_at: "2026-04-28T00:00:00.000Z",
        computed_json: "{}",
        details_json: "{}"
      },
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-27",
        transition_key: "inactive->active",
        previous_state: "inactive",
        new_state: "active",
        status: "confirmed",
        reason: "older",
        run_key: "run-1",
        triggered_at: "2026-04-27T00:00:00.000Z",
        computed_json: "{}",
        details_json: "{}"
      }
    );
    const rows = await listRuntimeTriggerEvents(env, "energy", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.triggeredAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("listRuntimeActions includes guardrail details and contextual parse errors", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    db.table("action_log").push({
      engine_key: "energy",
      rule_key: "energy.confirmation.spread_widening",
      release_key: "2026-04-28",
      decision_key: "energy:energy.confirmation.spread_widening:2026-04-28:inactive->active",
      decision: "ignored",
      action_type: "log_only",
      rationale: "logging only",
      decided_at: "2026-04-28T00:01:00.000Z",
      details_json: '{"guardrail":{"result":"blocked","reasons":["missing_feed"]}}'
    });

    const rows = await listRuntimeActions(env, "energy", 25);
    expect(rows[0]?.details).toEqual({ guardrail: { result: "blocked", reasons: ["missing_feed"] } });

    db.table("action_log").push({
      engine_key: "energy",
      rule_key: "energy.confirmation.spread_widening",
      release_key: "2026-04-29",
      decision_key: "energy:energy.confirmation.spread_widening:2026-04-29:inactive->active",
      decision: "ignored",
      action_type: "log_only",
      rationale: "bad json",
      decided_at: "2026-04-29T00:01:00.000Z",
      details_json: "{invalid"
    });

    await expect(listRuntimeActions(env, "energy", 25)).rejects.toThrow(
      "Failed to parse action_log details_json for engineKey=energy decisionKey=energy:energy.confirmation.spread_widening:2026-04-29:inactive->active"
    );
  });

  it("getRuleState reads previously persisted rule state", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);
    await upsertRuleState(env, {
      engineKey: "energy",
      ruleKey: "energy.confirmation.spread_widening",
      stateKey: "current",
      releaseKey: "2026-04-28",
      state: { status: "active" },
      evaluatedAt: "2026-04-28T00:00:00.000Z"
    });

    const current = await getRuleState(env, "energy", "energy.confirmation.spread_widening", "current");
    expect(current?.state).toEqual({ status: "active" });
  });

  it("getRuleState throws a descriptive error when state_json is invalid", async () => {
    const db = new MockD1Database();
    db.table("rule_state").push({
      engine_key: "energy",
      rule_key: "energy.confirmation.spread_widening",
      state_key: "current",
      release_key: "2026-04-28",
      state_json: "{invalid-json",
      evaluated_at: "2026-04-28T00:00:00.000Z"
    });
    const env = testEnv(db);

    await expect(getRuleState(env, "energy", "energy.confirmation.spread_widening", "current")).rejects.toThrow(
      "Failed to parse rule_state JSON for engineKey=energy ruleKey=energy.confirmation.spread_widening stateKey=current"
    );
  });

  it("insertActionLog writes allowed/blocked decisions and is idempotent by engine_key + decision_key", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    await insertActionLog(env, {
      engineKey: "energy",
      decisionKey: "decision-1",
      decision: "allowed",
      actionType: "notify",
      decidedAt: "2026-03-12T12:30:00.000Z"
    });

    await insertActionLog(env, {
      engineKey: "energy",
      decisionKey: "decision-2",
      decision: "blocked",
      actionType: "notify",
      decidedAt: "2026-03-13T12:30:00.000Z"
    });

    await insertActionLog(env, {
      engineKey: "energy",
      decisionKey: "decision-2",
      decision: "blocked",
      actionType: "notify",
      decidedAt: "2026-03-13T12:30:00.000Z"
    });

    const rows = db.table("action_log");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.decision)).toEqual(["allowed", "blocked"]);
  });

  it("hasActionLogDecisionForKey filters by engine_key and decision_key", async () => {
    const db = new MockD1Database();
    db.table("action_log").push(
      { engine_key: "energy", decision_key: "key-1" },
      { engine_key: "other", decision_key: "key-1" }
    );
    const env = testEnv(db);

    await expect(
      hasActionLogDecisionForKey(env, { engineKey: "energy", decisionKey: "key-1" })
    ).resolves.toBe(true);
    await expect(
      hasActionLogDecisionForKey(env, { engineKey: "energy", decisionKey: "missing" })
    ).resolves.toBe(false);
  });

  it("hasActionLogDecisionForRuleRelease filters by engine_key, rule_key, and release_key excluding current decision_key", async () => {
    const db = new MockD1Database();
    db.table("action_log").push(
      {
        engine_key: "energy",
        rule_key: "energy.confirmation.spread_widening",
        release_key: "2026-04-28",
        decision_key: "old-key"
      },
      {
        engine_key: "energy",
        rule_key: "energy.other",
        release_key: "2026-04-28",
        decision_key: "other-rule"
      }
    );
    const env = testEnv(db);

    await expect(
      hasActionLogDecisionForRuleRelease(env, {
        engineKey: "energy",
        ruleKey: "energy.confirmation.spread_widening",
        releaseKey: "2026-04-28",
        decisionKey: "new-key"
      })
    ).resolves.toBe(true);
    await expect(
      hasActionLogDecisionForRuleRelease(env, {
        engineKey: "energy",
        ruleKey: "energy.confirmation.spread_widening",
        releaseKey: "2026-04-28",
        decisionKey: "old-key"
      })
    ).resolves.toBe(false);
  });

  it("insertRenderedOutput is idempotent when releaseKey is omitted", async () => {
    const db = new MockD1Database();
    const env = testEnv(db);

    await insertRenderedOutput(env, {
      engineKey: "energy",
      outputKey: "daily-summary",
      renderedAt: "2026-03-12T12:30:00.000Z",
      markdownBody: "# Daily"
    });

    await insertRenderedOutput(env, {
      engineKey: "energy",
      outputKey: "daily-summary",
      renderedAt: "2026-03-12T12:30:00.000Z",
      markdownBody: "# Daily"
    });

    expect(db.table("rendered_outputs")).toHaveLength(1);
  });

  it("lists registered feeds and enabled feed keys for an engine", async () => {
    const db = new MockD1Database();
    db.table("feed_registry").push(
      { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", enabled: 1 },
      { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", enabled: 0 },
      { engine_key: "other", feed_key: "other.feed", enabled: 1 }
    );
    const env = testEnv(db);

    const registered = await listRegisteredFeeds(env, "energy");
    const enabledKeys = await listEnabledFeedKeys(env, "energy");

    expect(registered.map((row) => row.feedKey)).toEqual([
      "energy_spread.diesel_wti_crack",
      "energy_spread.wti_brent_spread"
    ]);
    expect(enabledKeys).toEqual(["energy_spread.wti_brent_spread"]);
  });

  it("returns latest feed checks per feed and derives health summary", async () => {
    const db = new MockD1Database();
    db.table("feed_registry").push(
      { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", display_name: "WTI-Brent Spread", enabled: 1 },
      { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", display_name: "Diesel-WTI Crack", enabled: 1 },
      { engine_key: "energy", feed_key: "energy_spread.unknown", display_name: "No checks yet", enabled: 1 }
    );
    db.table("feed_checks").push(
      { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", checked_at: "2026-04-27T00:00:00.000Z", step: "save_observation", result: "success", status: "ok", error_message: null },
      { engine_key: "energy", feed_key: "energy_spread.wti_brent_spread", checked_at: "2026-04-26T00:00:00.000Z", step: "save_observation", result: "failed", status: "error", error_message: "older failure" },
      { engine_key: "energy", feed_key: "energy_spread.diesel_wti_crack", checked_at: "2026-04-27T00:00:00.000Z", step: "save_observation", result: "failed", status: "error", error_message: "save failed" }
    );
    const env = testEnv(db);

    const checks = await getLatestFeedChecks(env, "energy");
    const summary = await getFeedHealthSummary(env, "energy");

    expect(checks).toHaveLength(2);
    expect(summary).toHaveLength(3);
    expect(summary.find((row) => row.feedKey === "energy_spread.wti_brent_spread")?.status).toBe("ok");
    expect(summary.find((row) => row.feedKey === "energy_spread.diesel_wti_crack")?.status).toBe("error");
    expect(summary.find((row) => row.feedKey === "energy_spread.unknown")?.status).toBe("unknown");
  });
});
