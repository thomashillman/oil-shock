import { describe, expect, it } from "vitest";
import {
  computeSeasonalBaselines,
  evaluateSeasonalBreach,
  periodKeyFor,
  seasonalBreachSeriesKey,
  type RawObservation
} from "../../src/jobs/collectors/seasonal-baseline";

describe("periodKeyFor", () => {
  it("maps a date to its ISO week for weekly granularity", () => {
    // 2026-01-01 is a Thursday, so it falls in ISO week 1.
    expect(periodKeyFor("2026-01-01", "week")).toBe("W01");
    expect(periodKeyFor("2026-01-08", "week")).toBe("W02");
  });

  it("maps a date to its month for monthly granularity", () => {
    expect(periodKeyFor("2026-06-12", "month")).toBe("M06");
    expect(periodKeyFor("2026-06", "month")).toBe("M06");
  });

  it("returns null for unparseable input", () => {
    expect(periodKeyFor("not-a-date", "week")).toBeNull();
    expect(periodKeyFor("2026", "month")).toBeNull();
  });
});

describe("computeSeasonalBaselines", () => {
  it("averages observations per period and counts samples", () => {
    const observations: RawObservation[] = [
      { observedAt: "2023-06-15", value: 90 },
      { observedAt: "2024-06-15", value: 92 },
      { observedAt: "2025-06-15", value: 94 },
      { observedAt: "2025-07-15", value: 50 }
    ];

    const baselines = computeSeasonalBaselines(observations, "month");
    const june = baselines.find((entry) => entry.periodKey === "M06");
    expect(june?.baselineValue).toBeCloseTo(92);
    expect(june?.sampleCount).toBe(3);
  });

  it("excludes a given year so the baseline reflects only prior years", () => {
    const observations: RawObservation[] = [
      { observedAt: "2024-06-15", value: 90 },
      { observedAt: "2025-06-15", value: 94 },
      { observedAt: "2026-06-15", value: 10 }
    ];

    const baselines = computeSeasonalBaselines(observations, "month", { excludeYear: 2026 });
    const june = baselines.find((entry) => entry.periodKey === "M06");
    expect(june?.baselineValue).toBeCloseTo(92);
    expect(june?.sampleCount).toBe(2);
  });
});

describe("evaluateSeasonalBreach", () => {
  const priorYears: RawObservation[] = [
    { observedAt: "2023-06-15", value: 90 },
    { observedAt: "2024-06-15", value: 92 },
    { observedAt: "2025-06-15", value: 94 }
  ];

  it("flags a breach when the recent reading is below the prior-year seasonal norm", () => {
    const observations = [...priorYears, { observedAt: "2026-06-15", value: 80 }];
    const baselines = computeSeasonalBaselines(observations, "month", { excludeYear: 2026 });

    const breach = evaluateSeasonalBreach(observations, baselines, { granularity: "month", rollingCount: 1 });
    expect(breach.breached).toBe(true);
    expect(breach.currentPeriodKey).toBe("M06");
    expect(breach.baselineValue).toBeCloseTo(92);
    expect(breach.rollingValue).toBeCloseTo(80);
  });

  it("does not flag a breach when the recent reading is at or above the norm", () => {
    const observations = [...priorYears, { observedAt: "2026-06-15", value: 95 }];
    const baselines = computeSeasonalBaselines(observations, "month", { excludeYear: 2026 });

    const breach = evaluateSeasonalBreach(observations, baselines, { granularity: "month", rollingCount: 1 });
    expect(breach.breached).toBe(false);
  });

  it("averages the rolling window before comparing to the baseline", () => {
    const observations: RawObservation[] = [
      { observedAt: "2024-06-15", value: 100 },
      { observedAt: "2025-06-15", value: 100 },
      // Two recent same-month readings averaging to 80, below the prior-year norm of 100.
      { observedAt: "2026-06-08", value: 70 },
      { observedAt: "2026-06-15", value: 90 }
    ];
    const baselines = computeSeasonalBaselines(observations, "month", { excludeYear: 2026 });

    const breach = evaluateSeasonalBreach(observations, baselines, { granularity: "month", rollingCount: 2 });
    expect(breach.rollingValue).toBeCloseTo(80);
    expect(breach.baselineValue).toBeCloseTo(100);
    expect(breach.breached).toBe(true);
  });

  it("reports no breach when the current period has no prior-year baseline", () => {
    const observations: RawObservation[] = [{ observedAt: "2026-03-15", value: 10 }];
    const baselines = computeSeasonalBaselines(observations, "month", { excludeYear: 2026 });

    const breach = evaluateSeasonalBreach(observations, baselines, { granularity: "month", rollingCount: 1 });
    expect(breach.breached).toBe(false);
    expect(breach.baselineValue).toBeNull();
  });

  it("reports no breach for empty observations", () => {
    const breach = evaluateSeasonalBreach([], [], { granularity: "week", rollingCount: 4 });
    expect(breach.breached).toBe(false);
    expect(breach.currentPeriodKey).toBeNull();
  });
});

describe("seasonalBreachSeriesKey", () => {
  it("derives a stable suffix from the feed key", () => {
    expect(seasonalBreachSeriesKey("physical_stress.inventory_draw")).toBe(
      "physical_stress.inventory_draw.seasonal_breach"
    );
  });
});
