import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

type FeedRow = {
  feed_key: string;
  freshness_threshold_seconds: string;
};

function isSqlite3Available(): boolean {
  try {
    execFileSync("sqlite3", ["--version"], { stdio: "pipe", encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

describe("Stage 2 macro-signals migration integration", () => {
  const skipIfNoSqlite3 = isSqlite3Available() ? it : it.skip;
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "oil-shock-migration-"));
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

  skipIfNoSqlite3("creates all Stage 2 tables and seeds expected metadata", () => {
    const dbPath = createDbPath();
    applyAllMigrations(dbPath);

    const tables = runSqlite(
      dbPath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('engines','feeds','metrics','rules','scores') ORDER BY name;"
    ).split("\n");

    expect(tables).toEqual(["engines", "feeds", "metrics", "rules", "scores"]);

    const engineCount = runSqlite(dbPath, "SELECT COUNT(*) FROM engines WHERE engine_key='oil_shock';");
    expect(engineCount).toBe("1");

    const feedRowsRaw = runSqlite(
      dbPath,
      "SELECT feed_key, freshness_threshold_seconds FROM feeds WHERE engine_key='oil_shock' ORDER BY feed_key;"
    );
    const feedRows: FeedRow[] = feedRowsRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [feed_key, freshness_threshold_seconds] = line.split("|");
        return { feed_key, freshness_threshold_seconds };
      });

    expect(feedRows).toEqual([
      { feed_key: "market_response.crack_spread", freshness_threshold_seconds: "691200" },
      { feed_key: "market_response.sec_impairment", freshness_threshold_seconds: "691200" },
      { feed_key: "physical_stress.eu_gas_storage", freshness_threshold_seconds: "691200" },
      { feed_key: "physical_stress.eu_pipeline_flow", freshness_threshold_seconds: "691200" },
      { feed_key: "physical_stress.inventory_draw", freshness_threshold_seconds: "691200" },
      { feed_key: "physical_stress.refinery_utilization", freshness_threshold_seconds: "691200" },
      { feed_key: "price_signal.curve_slope", freshness_threshold_seconds: "259200" },
      { feed_key: "price_signal.spot_wti", freshness_threshold_seconds: "259200" }
    ]);
  });

  skipIfNoSqlite3("backfills historical snapshots into scores with expected mapping and remains idempotent", () => {
    const dbPath = createDbPath();
    applyAllMigrations(dbPath);

    runSqlite(
      dbPath,
      `
      INSERT INTO signal_snapshots (
        generated_at, mismatch_score, actionability_state, coverage_confidence,
        source_freshness_json, evidence_ids_json, dislocation_state_json,
        state_rationale, subscores_json, clocks_json, ledger_impact_json, run_key
      ) VALUES
      ('2026-04-20T00:00:00.000Z', 0.11, 'none', 0.9, '{}', '[]', '{"state":"aligned"}', 'a', '{}', '{}', null, 'run-1'),
      ('2026-04-21T00:00:00.000Z', 0.22, 'watch', 0.8, '{}', '[]', '{"state":"mild_divergence"}', 'b', '{}', '{}', null, 'run-2');
      `
    );

    applyMigrationFile(dbPath, resolve(process.cwd(), "../db/migrations/0010_macro_signals_stage2.sql"));

    const firstCount = runSqlite(dbPath, "SELECT COUNT(*) FROM scores WHERE feed_key='oil_shock.mismatch_score';");
    expect(firstCount).toBe("2");

    const mappedRows = runSqlite(
      dbPath,
      "SELECT engine_key, feed_key, scored_at, score_value, confidence, run_key FROM scores ORDER BY scored_at;"
    ).split("\n");

    expect(mappedRows).toEqual([
      "oil_shock|oil_shock.mismatch_score|2026-04-20T00:00:00.000Z|0.11|0.9|run-1",
      "oil_shock|oil_shock.mismatch_score|2026-04-21T00:00:00.000Z|0.22|0.8|run-2"
    ]);

    applyMigrationFile(dbPath, resolve(process.cwd(), "../db/migrations/0010_macro_signals_stage2.sql"));
    const secondCount = runSqlite(dbPath, "SELECT COUNT(*) FROM scores WHERE feed_key='oil_shock.mismatch_score';");
    expect(secondCount).toBe("2");
  });
});
