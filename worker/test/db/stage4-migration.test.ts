import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("stage 4 migration", () => {
  it("seeds new engines, feeds, metrics, and rules", () => {
    const migration = readFileSync(resolve(process.cwd(), "../db/migrations/0012_stage4_new_engines.sql"), "utf8");

    expect(migration).toContain("('energy'");
    expect(migration).toContain("('macro_releases'");
    expect(migration).toContain("energy_spread.wti_brent_spread");
    expect(migration).toContain("macro_release.us_cpi_surprise");
    expect(migration).toContain("energy.confirmation.spread_widening");
  });
});
