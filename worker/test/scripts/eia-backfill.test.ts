import { describe, expect, it } from "vitest";
import { buildBackfillSql, buildEnergyBackfillPoints } from "../../../scripts/backfill-eia-energy";

describe("EIA energy backfill", () => {
  it("reconstructs spread points from aligned upstream EIA rows", () => {
    const points = buildEnergyBackfillPoints({
      wti: [
        { period: "2026-01-03", value: "65.0" },
        { period: "2026-01-04", value: "66.0" }
      ],
      brent: [
        { period: "2026-01-03", value: "70.0" },
        { period: "2026-01-04", value: "71.0" }
      ],
      diesel: [
        { period: "2026-01-03", value: "2.0" },
        { period: "2026-01-04", value: "2.1" }
      ]
    });

    expect(points).toHaveLength(4);
    expect(points[0]).toMatchObject({
      seriesKey: "energy_spread.wti_brent_spread",
      observedAt: "2026-01-03",
      releaseKey: "energy:energy_spread.wti_brent_spread:2026-01-03",
      unit: "index"
    });
    expect(points[0]?.value).toBeCloseTo(0.333333, 5);
    expect(points[1]?.seriesKey).toBe("energy_spread.diesel_wti_crack");
    expect(points[1]?.value).toBeCloseTo(0.475, 3);
  });

  it("builds idempotent SQL for the backfill rows", () => {
    const sql = buildBackfillSql([
      {
        seriesKey: "energy_spread.wti_brent_spread",
        observedAt: "2026-01-03",
        value: 0.333333,
        unit: "index",
        releaseKey: "energy:energy_spread.wti_brent_spread:2026-01-03",
        metadata: { provider: "EIA", bridge: "energy_eia_backfill_v1" }
      }
    ]);

    expect(sql).toContain("INSERT INTO series_points");
    expect(sql).toContain("INSERT INTO observations");
    expect(sql).toContain("energy:energy_spread.wti_brent_spread:2026-01-03");
    expect(sql).toContain("'Historical'");
  });
});
