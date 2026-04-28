import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CPI feed registry migration", () => {
  it("seeds disabled-by-default CPI feed_registry row with idempotent insert", () => {
    const migration = readFileSync(resolve(process.cwd(), "../db/migrations/0019_seed_cpi_feed_registry.sql"), "utf8");

    expect(migration).toContain("INSERT OR IGNORE INTO feed_registry");
    expect(migration).toContain("'cpi'");
    expect(migration).toContain("'macro_release.us_cpi.headline_yoy'");
    expect(migration).toContain("'BLS'");
    expect(migration).toContain("'macro_release'");
    expect(migration).toMatch(/\b0\b/);
  });
});
