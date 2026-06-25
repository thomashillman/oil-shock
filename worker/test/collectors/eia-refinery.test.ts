import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";
import {
  buildRefineryObservations,
  collectEiaRefinery
} from "../../src/jobs/collectors/eia-refinery";

vi.mock("../../src/lib/api-instrumentation", () => ({
  instrumentedFetch: vi.fn()
}));

import { instrumentedFetch } from "../../src/lib/api-instrumentation";

const mockInstrumentedFetch = vi.mocked(instrumentedFetch);

describe("collectEiaRefinery", () => {
  const env = createTestEnv() as unknown as Env;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("collects the latest monthly refinery utilization stress point", async () => {
    mockInstrumentedFetch.mockResolvedValueOnce({
      response: {
        data: [
          { period: "2026-02", value: "89.0", units: "%", "series-description": "Refinery utilization" },
          { period: "2026-03", value: "91.6", units: "%", "series-description": "Refinery utilization" }
        ],
        total: 2
      }
    });

    const points = await collectEiaRefinery(env, "2026-04-23T00:00:00.000Z");
    expect(mockInstrumentedFetch).toHaveBeenCalledTimes(1);
    expect(String(mockInstrumentedFetch.mock.calls[0]?.[1])).toContain("/petroleum/pnp/unc/data");
    expect(String(mockInstrumentedFetch.mock.calls[0]?.[1])).toContain("MOPUEUS2");

    const stressPoint = points.find((point) => point.seriesKey === "physical_stress.refinery_utilization");
    expect(stressPoint).toMatchObject({
      observedAt: "2026-03",
      unit: "ratio",
      sourceKey: "eia"
    });
    expect(stressPoint?.value).toBeCloseTo(0.084);

    // Derived seasonal-breach flag; only current-year history (excluded from the baseline) means
    // there is no prior-year month norm to breach, so the flag is 0.
    const breachPoint = points.find((point) => point.seriesKey === "physical_stress.refinery_utilization.seasonal_breach");
    expect(breachPoint).toMatchObject({ observedAt: "2026-03", value: 0 });
  });
});

describe("buildRefineryObservations", () => {
  it("normalizes monthly utilization rows into backfill observations", () => {
    const observations = buildRefineryObservations(
      [
        { period: "2026-03", value: "91.6", units: "%", "series-description": "Refinery utilization" },
        { period: "2026-02", value: "89.0", units: "%" }
      ],
      "eia_refinery_monthly_backfill_v1"
    );

    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      releaseKey: "energy:physical_stress.refinery_utilization:2026-02",
      observedAt: "2026-02",
      asOfDate: "2026-02",
      unit: "ratio"
    });
    expect(observations[0]?.value).toBeCloseTo(0.11);
    expect(observations[0]?.metadata.bridge).toBe("eia_refinery_monthly_backfill_v1");
  });
});
