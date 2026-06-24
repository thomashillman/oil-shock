import { describe, expect, it } from "vitest";
import { categoryForFeedKey } from "../../src/lib/observation-category";

describe("categoryForFeedKey", () => {
  it("maps known prefixes to their signal category", () => {
    expect(categoryForFeedKey("physical_stress.eu_gas_storage")).toBe("physical_stress");
    expect(categoryForFeedKey("physical_stress.inventory_draw")).toBe("physical_stress");
    expect(categoryForFeedKey("energy_spread.diesel_wti_crack")).toBe("energy_spread");
    expect(categoryForFeedKey("price_signal.curve_slope")).toBe("price_signal");
  });

  it("falls back to 'other' for unknown or malformed keys", () => {
    expect(categoryForFeedKey("macro_release.us_cpi")).toBe("other");
    expect(categoryForFeedKey("nodot")).toBe("other");
    expect(categoryForFeedKey("")).toBe("other");
  });
});
