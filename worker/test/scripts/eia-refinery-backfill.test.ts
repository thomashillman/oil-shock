import { describe, expect, it } from "vitest";
import { buildBackfillSql } from "../../../scripts/backfill-eia-refinery";
import { buildRefineryObservations } from "../../src/jobs/collectors/eia-refinery";

describe("EIA refinery backfill", () => {
  it("reconstructs refinery stress observations from aligned upstream rows", () => {
    const observations = buildRefineryObservations(
      [
        { period: "2026-01", value: "90.0", units: "%" },
        { period: "2026-02", value: "89.0", units: "%" }
      ],
      "eia_refinery_monthly_backfill_v1"
    );

    expect(observations).toHaveLength(2);
    expect(observations[1]).toMatchObject({
      seriesKey: "physical_stress.refinery_utilization",
      releaseKey: "energy:physical_stress.refinery_utilization:2026-02",
      observedAt: "2026-02",
      unit: "ratio"
    });
    expect(observations[1]?.value).toBeCloseTo(0.11);
  });

  it("builds idempotent SQL for the refinery backfill rows", () => {
    const sql = buildBackfillSql(
      buildRefineryObservations(
        [{ period: "2026-02", value: "89.0", units: "%" }],
        "eia_refinery_monthly_backfill_v1"
      )
    );

    expect(sql).toContain("INSERT INTO series_points");
    expect(sql).toContain("INSERT INTO observations");
    expect(sql).toContain("energy:physical_stress.refinery_utilization:2026-02");
    expect(sql).toContain("'Historical'");
  });
});
