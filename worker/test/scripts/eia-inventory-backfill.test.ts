import { describe, expect, it } from "vitest";
import { buildBackfillSql } from "../../../scripts/backfill-eia-inventory";
import { buildInventoryObservations } from "../../src/jobs/collectors/eia-inventory";

describe("EIA inventory backfill", () => {
  it("reconstructs inventory stress observations from weekly rows", () => {
    const observations = buildInventoryObservations(
      [
        { period: "2026-05-29", value: "433712", units: "MBBL" },
        { period: "2026-06-05", value: "426485", units: "MBBL" },
        { period: "2026-06-12", value: "418222", units: "MBBL" }
      ],
      "eia_inventory_weekly_backfill_v1"
    );

    expect(observations).toHaveLength(3);
    expect(observations[2]).toMatchObject({
      seriesKey: "physical_stress.inventory_draw",
      releaseKey: "energy:physical_stress.inventory_draw:2026-06-12",
      observedAt: "2026-06-12",
      unit: "ratio"
    });
  });

  it("builds idempotent SQL for the inventory backfill rows", () => {
    const sql = buildBackfillSql(
      buildInventoryObservations([{ period: "2026-06-12", value: "418222", units: "MBBL" }], "eia_inventory_weekly_backfill_v1")
    );

    expect(sql).toContain("INSERT INTO series_points");
    expect(sql).toContain("INSERT INTO observations");
    expect(sql).toContain("energy:physical_stress.inventory_draw:2026-06-12");
    expect(sql).toContain("'Historical'");
  });
});
