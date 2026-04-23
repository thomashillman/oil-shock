import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";
import { collectEnergy } from "../../src/jobs/collectors/energy";

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
