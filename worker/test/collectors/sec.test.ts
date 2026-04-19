import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectSec } from "../../src/jobs/collectors/sec";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";
import { normalizePoints } from "../../src/core/normalize";

vi.mock("../../src/lib/http-client", () => ({
  fetchJson: vi.fn(),
  fetchText: vi.fn()
}));

import { fetchJson, fetchText } from "../../src/lib/http-client";

const mockFetchJson = vi.mocked(fetchJson);
const mockFetchText = vi.mocked(fetchText);

describe("collectSec", () => {
  const env = createTestEnv() as unknown as Env;
  const nowIso = "2026-04-18T00:00:00.000Z";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] (no stub 0.41) when ticker map fetch fails", async () => {
    mockFetchJson.mockRejectedValue(new Error("network error"));

    const points = await collectSec(env, nowIso);

    expect(points).toHaveLength(0);
  });

  it("returns [] (no stub 0.41) when ticker map is empty", async () => {
    mockFetchJson.mockResolvedValue({});

    const points = await collectSec(env, nowIso);

    expect(points).toHaveLength(0);
  });

  it("writes to market_response.sec_impairment, not transmission.impairment_mentions", async () => {
    const tickerMap = {
      "0": { ticker: "XOM", cik_str: 34088, title: "Exxon Mobil" }
    };
    const submissions = {
      filings: {
        recent: {
          form: ["10-K"],
          filingDate: ["2026-01-15"],
          accessionNumber: ["0000034088-26-000001"],
          primaryDocument: ["xom10k.htm"]
        }
      }
    };

    mockFetchJson
      .mockResolvedValueOnce(tickerMap)
      .mockResolvedValueOnce(submissions);
    mockFetchText.mockResolvedValue("<html>higher fuel costs, margin pressure</html>");

    const points = await collectSec(env, nowIso);

    const keys = points.map(p => p.seriesKey);
    expect(keys).not.toContain("transmission.impairment_mentions");
    expect(keys).toContain("market_response.sec_impairment");
  });

  it("uses filing date as observedAt, not nowIso", async () => {
    const filingDate = "2026-01-15";
    const tickerMap = {
      "0": { ticker: "XOM", cik_str: 34088, title: "Exxon Mobil" }
    };
    const submissions = {
      filings: {
        recent: {
          form: ["10-K"],
          filingDate: [filingDate],
          accessionNumber: ["0000034088-26-000001"],
          primaryDocument: ["xom10k.htm"]
        }
      }
    };

    mockFetchJson
      .mockResolvedValueOnce(tickerMap)
      .mockResolvedValueOnce(submissions);
    mockFetchText.mockResolvedValue("<html>higher fuel costs realized price crack spread</html>");

    const points = await collectSec(env, nowIso);

    expect(points).toHaveLength(1);
    expect(points[0]?.observedAt).toBe(filingDate);
    expect(points[0]?.observedAt).not.toBe(nowIso);
  });
});

describe("normalizePoints — timestamp validation", () => {
  it("drops future-dated points", () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const result = normalizePoints("test", [{ seriesKey: "k", observedAt: futureDate, value: 0.5, unit: "index" }]);
    expect(result).toHaveLength(0);
  });

  it("drops points older than 1 year", () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const result = normalizePoints("test", [{ seriesKey: "k", observedAt: old, value: 0.5, unit: "index" }]);
    expect(result).toHaveLength(0);
  });

  it("drops points with unparseable observedAt", () => {
    const result = normalizePoints("test", [{ seriesKey: "k", observedAt: "not-a-date", value: 0.5, unit: "index" }]);
    expect(result).toHaveLength(0);
  });

  it("keeps valid recent points", () => {
    const valid = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago
    const result = normalizePoints("test", [{ seriesKey: "k", observedAt: valid, value: 0.5, unit: "index" }]);
    expect(result).toHaveLength(1);
  });
});
