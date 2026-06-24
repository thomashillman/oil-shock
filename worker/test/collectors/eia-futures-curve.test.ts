import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";
import { buildFuturesCurveObservations, collectEiaFuturesCurve } from "../../src/jobs/collectors/eia-futures-curve";

vi.mock("../../src/lib/api-instrumentation", () => ({
  instrumentedFetch: vi.fn()
}));

import { instrumentedFetch } from "../../src/lib/api-instrumentation";

const mockInstrumentedFetch = vi.mocked(instrumentedFetch);

describe("collectEiaFuturesCurve", () => {
  const env = createTestEnv() as unknown as Env;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("collects the latest public futures curve proxy point", async () => {
    mockInstrumentedFetch
      .mockResolvedValueOnce({
        response: {
          data: [{ period: "2024-04-05", value: "85.56", units: "$/BBL", "series-description": "Cushing, OK Crude Oil Future Contract 1" }],
          total: 1
        }
      })
      .mockResolvedValueOnce({
        response: {
          data: [{ period: "2024-04-05", value: "84.24", units: "$/BBL", "series-description": "Cushing, OK Crude Oil Future Contract 4" }],
          total: 1
        }
      });

    const points = await collectEiaFuturesCurve(env, "2026-06-24T00:00:00.000Z");
    expect(mockInstrumentedFetch).toHaveBeenCalledTimes(2);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      seriesKey: "price_signal.curve_slope",
      observedAt: "2024-04-05",
      unit: "ratio",
      sourceKey: "eia"
    });
    expect(points[0]?.value).toBeLessThan(0.5);
  });
});

describe("buildFuturesCurveObservations", () => {
  it("builds backfill observations from paired contract rows", () => {
    const observations = buildFuturesCurveObservations(
      [
        { period: "2024-04-05", value: "85.56", units: "$/BBL", "series-description": "Cushing, OK Crude Oil Future Contract 1" }
      ],
      [
        { period: "2024-04-05", value: "84.24", units: "$/BBL", "series-description": "Cushing, OK Crude Oil Future Contract 4" }
      ],
      "eia_futures_curve_daily_backfill_v1"
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      releaseKey: "energy:price_signal.curve_slope:2024-04-05",
      observedAt: "2024-04-05",
      unit: "ratio"
    });
    expect(observations[0]?.metadata.bridge).toBe("eia_futures_curve_daily_backfill_v1");
  });
});
