import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/cpi-responses.json";
import { collectCpi, parseCpiFixture, type CpiObservationCandidate } from "../../src/jobs/collectors/cpi";
import { createTestEnv } from "../helpers/fake-d1";

describe("parseCpiFixture", () => {
  it("parses CPI fixture into a deterministic normalized observation", () => {
    const parsed = parseCpiFixture(fixtures.success);
    expect(parsed).toEqual<CpiObservationCandidate>({
      engineKey: "cpi",
      feedKey: "macro_release.us_cpi.all_items_index",
      seriesKey: "macro_release.us_cpi.all_items_index",
      releaseKey: "cpi:2026-04",
      asOfDate: "2026-04",
      observedAt: "2026-05-12T12:30:00.000Z",
      value: 316.582,
      unit: "index",
      metadata: {
        provider: "BLS",
        sourceSeriesId: "CUUR0000SA0",
        periodName: "April",
        releaseName: "Consumer Price Index",
        bridge: "cpi_collect_only_v1"
      }
    });
  });

  it("throws contextual error for malformed fixture structure", () => {
    expect(() => parseCpiFixture(fixtures.malformed)).toThrowError(/cpi.*results.series/i);
  });

  it("throws clear error for missing value fields", () => {
    expect(() => parseCpiFixture(fixtures.missingValue)).toThrowError(/cpi.*value/i);
  });

  it("is deterministic for identical fixture input", () => {
    expect(parseCpiFixture(fixtures.success)).toEqual(parseCpiFixture(fixtures.success));
  });
});

describe("collectCpi", () => {
  it("returns single parsed observation candidate from bundled fixture", async () => {
    const env = createTestEnv();
    const result = await collectCpi(env, "2026-04-27T00:00:00.000Z");
    expect(result).toHaveLength(1);
    expect(result[0]?.feedKey).toBe("macro_release.us_cpi.all_items_index");
  });
});
