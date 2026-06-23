import { describe, expect, it } from "vitest";
import { FEED_CATALOG } from "./catalog";

const EXPECTED_BACKEND_FEED_KEYS = [
  "spot_wti",
  "curve_slope",
  "inventory_draw",
  "refinery_utilization",
  "crack_spread",
  "eu_pipeline_flow",
  "eu_gas_storage",
  "sec_impairment",
] as const;

describe("operator shell feed catalog", () => {
  it("matches expected backend feed_freshness contract keys", () => {
    const actual = FEED_CATALOG.map((feed) => feed.feedKey).sort();
    const expected = [...EXPECTED_BACKEND_FEED_KEYS].sort();
    expect(actual).toEqual(expected);
  });
});
