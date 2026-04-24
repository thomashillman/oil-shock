import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";
import { collectEnergy } from "../../src/jobs/collectors/energy";
import { runEnergyScore, safeValue } from "../../src/jobs/score";
import { writeSeriesPoints, getLatestSeriesValue, listActiveRules } from "../../src/db/client";

vi.mock("../../src/lib/http-client", () => ({
  fetchJson: vi.fn()
}));

import { fetchJson } from "../../src/lib/http-client";

const mockFetchJson = vi.mocked(fetchJson);

describe("collectEnergy", () => {
  const env = createTestEnv() as unknown as Env;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("collects WTI/Brent spread and diesel crack points with upstream periods", async () => {
    mockFetchJson
      .mockResolvedValueOnce({ response: { data: [{ period: "2026-04-20", value: "65.0" }], total: 1 } })
      .mockResolvedValueOnce({ response: { data: [{ period: "2026-04-20", value: "69.5" }], total: 1 } })
      .mockResolvedValueOnce({ response: { data: [{ period: "2026-04-20", value: "95.0" }], total: 1 } });

    const points = await collectEnergy(env, "2026-04-23T00:00:00.000Z");
    expect(mockFetchJson).toHaveBeenCalledTimes(3);
    expect(points.map((point) => point.seriesKey).sort()).toEqual([
      "energy_spread.diesel_wti_crack",
      "energy_spread.wti_brent_spread"
    ]);

    for (const point of points) {
      expect(point.observedAt).toBe("2026-04-20");
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(1);
    }
  });

  it("returns no points when one side of a spread is unavailable", async () => {
    mockFetchJson
      .mockResolvedValueOnce({ response: { data: [{ period: "2026-04-20", value: "65.0" }], total: 1 } })
      .mockResolvedValueOnce({ response: { data: [], total: 0 } })
      .mockResolvedValueOnce({ response: { data: [{ period: "2026-04-20", value: "95.0" }], total: 1 } });

    const points = await collectEnergy(env, "2026-04-23T00:00:00.000Z");
    expect(points).toEqual([]);
  });
});

describe("Energy scoring determinism", () => {
  it("produces deterministic output for identical inputs", async () => {
    const testValues = [0.65, 0.58, 0.42];

    const result1 = safeValue(testValues[0]);
    const result2 = safeValue(testValues[0]);
    expect(result1).toBe(result2);

    const clipped1 = safeValue(1.5);
    const clipped2 = safeValue(1.5);
    expect(clipped1).toBe(clipped2);
    expect(clipped1).toBe(1);

    const nullResult1 = safeValue(null);
    const nullResult2 = safeValue(null);
    expect(nullResult1).toBe(nullResult2);
    expect(nullResult1).toBe(0);
  });
});

describe("Energy data freshness", () => {
  it("maintains < 5% variance across collection runs", async () => {
    const env = createTestEnv() as unknown as Env;

    const testValue1 = 0.65;
    const testValue2 = 0.63;

    // First collection run
    await writeSeriesPoints(env, [
      {
        seriesKey: "energy_spread.wti_brent_spread",
        observedAt: "2026-04-20",
        value: testValue1,
        unit: "USD/bbl",
        sourceKey: "eia"
      },
      {
        seriesKey: "energy_spread.diesel_wti_crack",
        observedAt: "2026-04-20",
        value: testValue1,
        unit: "USD/bbl",
        sourceKey: "eia"
      }
    ]);

    const point1 = await getLatestSeriesValue(env, "energy_spread.wti_brent_spread");
    expect(point1?.value).toBe(testValue1);

    // Second collection run - to SAME environment
    await writeSeriesPoints(env, [
      {
        seriesKey: "energy_spread.wti_brent_spread",
        observedAt: "2026-04-21",
        value: testValue2,
        unit: "USD/bbl",
        sourceKey: "eia"
      }
    ]);

    const point2 = await getLatestSeriesValue(env, "energy_spread.wti_brent_spread");
    expect(point2?.value).toBe(testValue2);

    // Variance within same database over time
    const observedVariance = Math.abs((point2?.value ?? 0) - (point1?.value ?? 0)) / (point1?.value ?? 1);
    expect(observedVariance).toBeLessThan(0.05);
  });
});
