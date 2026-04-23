import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stage 2 macro-signals migration", () => {
  const migration = readFileSync(resolve(process.cwd(), "../db/migrations/0010_macro_signals_stage2.sql"), "utf8");

  it("creates additive tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS engines");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS feeds");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS metrics");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS rules");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS scores");
  });

  it("seeds oil shock engine and feed metadata", () => {
    expect(migration).toContain("INSERT OR IGNORE INTO engines");
    expect(migration).toContain("('oil_shock'");
    expect(migration).toContain("INSERT OR IGNORE INTO feeds");
    expect(migration).toContain("price_signal.spot_wti");
    expect(migration).toContain("market_response.sec_impairment");
  });

  it("includes historical score backfill", () => {
    expect(migration).toContain("INSERT OR IGNORE INTO scores");
    expect(migration).toContain("FROM signal_snapshots");
  });
});
