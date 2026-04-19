import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectEia } from "../../src/jobs/collectors/eia";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";

vi.mock("../../src/lib/http-client", () => ({
  fetchJson: vi.fn(),
  fetchText: vi.fn()
}));

import { fetchJson } from "../../src/lib/http-client";

const mockFetchJson = vi.mocked(fetchJson);

const EMPTY_EIA = { response: { data: [], total: 0 } };

function makeRows(rows: Array<{ period: string; value: number }>) {
  return { response: { data: rows, total: rows.length } };
}

describe("collectEia", () => {
  const env = createTestEnv() as unknown as Env;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchJson.mockResolvedValue(EMPTY_EIA);
  });

  it("uses a rolling date window — no hardcoded start date 2026-02-01 in URLs", async () => {
    await collectEia(env, new Date().toISOString());

    const calls = mockFetchJson.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [url] of calls) {
      // The old hardcoded start date must not appear
      expect(url).not.toContain("2026-02-01");
    }
  });

  it("uses EIA period field as observedAt, not the nowIso argument", async () => {
    const nowIso = "2026-04-18T00:00:00.000Z";
    const eiaperiod = "2026-04-10";

    // First call = WTI spot; override just that one with real data
    mockFetchJson
      .mockResolvedValueOnce(makeRows([{ period: eiaperiod, value: 85 }, { period: "2026-04-09", value: 84 }]))
      .mockResolvedValue(EMPTY_EIA);

    const points = await collectEia(env, nowIso);

    const wtiPoint = points.find(p => p.seriesKey === "price_signal.spot_wti");
    expect(wtiPoint).toBeDefined();
    expect(wtiPoint?.observedAt).toBe(eiaperiod);
    expect(wtiPoint?.observedAt).not.toBe(nowIso);
  });

  it("produces price_signal and physical_stress series keys, not old physical/recognition keys", async () => {
    const nowIso = "2026-04-18T00:00:00.000Z";

    mockFetchJson
      .mockResolvedValueOnce(makeRows([{ period: "2026-04-10", value: 85 }, { period: "2026-04-09", value: 84 }]))
      .mockResolvedValueOnce(makeRows([{ period: "2026-04-10", value: 90 }, { period: "2026-01-10", value: 75 }]))
      .mockResolvedValueOnce(makeRows([{ period: "2026-04-05", value: 420000 }, { period: "2026-03-29", value: 425000 }]))
      .mockResolvedValueOnce(makeRows([{ period: "2026-03-01", value: 91 }]))
      .mockResolvedValue(EMPTY_EIA);

    const points = await collectEia(env, nowIso);

    const keys = points.map(p => p.seriesKey);
    expect(keys).not.toContain("physical.inventory_draw");
    expect(keys).not.toContain("physical.utilization");
    expect(keys).not.toContain("recognition.curve_signal");
    expect(keys).not.toContain("transmission.crack_signal");
    expect(keys.some(k => k.startsWith("price_signal."))).toBe(true);
    expect(keys.some(k => k.startsWith("physical_stress."))).toBe(true);
  });
});
