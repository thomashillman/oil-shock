import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { createTestEnv } from "../helpers/fake-d1";
import { parseCpiData } from "../../src/jobs/collectors/macro-releases";
import fixtures from "../fixtures/bls-cpi-responses.json";

vi.mock("../../src/lib/api-instrumentation", () => ({
  instrumentedFetch: vi.fn()
}));

describe("parseCpiData", () => {
  it("extracts latest CPI value from successful response", () => {
    const points = parseCpiData(fixtures.successResponse);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      seriesKey: "macro_cpi.headline",
      value: 316.582,
      observedAt: "2026-04"
    });
  });

  it("uses latest period and year correctly", () => {
    const points = parseCpiData(fixtures.successResponse);

    expect(points[0]).toBeDefined();
    expect(points[0].observedAt).toBe("2026-04");
    expect(typeof points[0].value).toBe("number");
  });

  it("returns empty array for response with no data", () => {
    const points = parseCpiData(fixtures.emptyDataResponse);

    expect(points).toEqual([]);
  });

  it("returns empty array when series data is empty", () => {
    const points = parseCpiData(fixtures.noSeriesResponse);

    expect(points).toEqual([]);
  });

  it("handles malformed data without throwing", () => {
    expect(() => {
      parseCpiData(fixtures.malformedResponse);
    }).not.toThrow();
  });

  it("skips data points with null or non-numeric values", () => {
    const points = parseCpiData(fixtures.malformedResponse);

    expect(points).toEqual([]);
  });

  it("produces deterministic output for identical input", () => {
    const result1 = parseCpiData(fixtures.successResponse);
    const result2 = parseCpiData(fixtures.successResponse);

    expect(result1).toEqual(result2);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });
});
