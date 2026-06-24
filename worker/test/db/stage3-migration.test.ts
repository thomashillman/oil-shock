import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stage 3 migration", () => {
  it("does not duplicate guardrail flags and seeds Oil Shock rules", () => {
    const liveContractMigration = readFileSync(
      resolve(process.cwd(), "../db/migrations/0002_live_contract.sql"),
      "utf8",
    );
    const migration = readFileSync(resolve(process.cwd(), "../db/migrations/0011_stage3_rules_guardrails.sql"), "utf8");

    expect(liveContractMigration).toContain("ALTER TABLE signal_snapshots ADD COLUMN guardrail_flags_json TEXT");
    expect(migration).not.toContain("ALTER TABLE signal_snapshots ADD COLUMN guardrail_flags_json TEXT");
    expect(migration).toContain("oilshock.recognition_gap_bonus");
    expect(migration).toContain("oilshock.market_confirmation_bonus");
  });
});
