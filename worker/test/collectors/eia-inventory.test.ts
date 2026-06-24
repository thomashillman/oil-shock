import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";
import { buildInventoryObservations, collectEiaInventory } from "../../src/jobs/collectors/eia-inventory";

vi.mock("../../src/lib/api-instrumentation", () => ({
  instrumentedFetch: vi.fn()
}));

import { instrumentedFetch } from "../../src/lib/api-instrumentation";

const mockInstrumentedFetch = vi.mocked(instrumentedFetch);

describe("collectEiaInventory", () => {
  const env = createTestEnv() as unknown as Env;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("collects the latest weekly crude inventory stress point", async () => {
    mockInstrumentedFetch.mockResolvedValueOnce({
      response: {
        data: [
          { period: "2026-05-29", value: "433712", units: "MBBL", "series-description": "U.S. Ending Stocks excluding SPR of Crude Oil" },
          { period: "2026-06-05", value: "426485", units: "MBBL", "series-description": "U.S. Ending Stocks excluding SPR of Crude Oil" },
          { period: "2026-06-12", value: "418222", units: "MBBL", "series-description": "U.S. Ending Stocks excluding SPR of Crude Oil" }
        ],
        total: 3
      }
    });

    const points = await collectEiaInventory(env, "2026-06-24T00:00:00.000Z");
    expect(mockInstrumentedFetch).toHaveBeenCalledTimes(1);
    expect(String(mockInstrumentedFetch.mock.calls[0]?.[1])).toContain("WCESTUS1");
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      seriesKey: "physical_stress.inventory_draw",
      observedAt: "2026-06-12",
      unit: "ratio",
      sourceKey: "eia"
    });
    expect(points[0]?.value).toBeCloseTo(1);
  });
});

describe("buildInventoryObservations", () => {
  it("builds trailing-window inventory stress observations", () => {
    const observations = buildInventoryObservations(
      [
        { period: "2026-05-29", value: "433712", units: "MBBL" },
        { period: "2026-06-05", value: "426485", units: "MBBL" },
        { period: "2026-06-12", value: "418222", units: "MBBL" }
      ],
      "eia_inventory_weekly_backfill_v1"
    );

    expect(observations).toHaveLength(3);
    expect(observations[0]).toMatchObject({
      releaseKey: "energy:physical_stress.inventory_draw:2026-05-29",
      observedAt: "2026-05-29",
      unit: "ratio"
    });
    expect(observations[2]?.value).toBeCloseTo(1);
    expect(observations[2]?.metadata.bridge).toBe("eia_inventory_weekly_backfill_v1");
  });
});
