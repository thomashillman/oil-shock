import { describe, expect, it } from "vitest";
import { buildBackfillSql } from "../../../scripts/backfill-eia-futures-curve";
import { buildFuturesCurveObservations } from "../../src/jobs/collectors/eia-futures-curve";

describe("EIA futures curve backfill", () => {
  it("reconstructs curve slope observations from paired contract rows", () => {
    const observations = buildFuturesCurveObservations(
      [{ period: "2024-04-05", value: "85.56", units: "$/BBL" }],
      [{ period: "2024-04-05", value: "84.24", units: "$/BBL" }],
      "eia_futures_curve_daily_backfill_v1"
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      seriesKey: "price_signal.curve_slope",
      releaseKey: "energy:price_signal.curve_slope:2024-04-05",
      observedAt: "2024-04-05",
      unit: "ratio"
    });
  });

  it("builds idempotent SQL for the futures curve backfill rows", () => {
    const sql = buildBackfillSql(
      buildFuturesCurveObservations(
        [{ period: "2024-04-05", value: "85.56", units: "$/BBL" }],
        [{ period: "2024-04-05", value: "84.24", units: "$/BBL" }],
        "eia_futures_curve_daily_backfill_v1"
      )
    );

    expect(sql).toContain("INSERT INTO series_points");
    expect(sql).toContain("INSERT INTO observations");
    expect(sql).toContain("energy:price_signal.curve_slope:2024-04-05");
    expect(sql).toContain("'Historical'");
  });
});
