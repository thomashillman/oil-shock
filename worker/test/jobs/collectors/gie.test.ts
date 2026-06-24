import { describe, expect, it } from "vitest";
import { parseGieStorageResponse } from "../../../src/jobs/collectors/gie";

describe("GIE AGSI+ backfill parser", () => {
  it("normalizes storage fullness into inverse stress ratio", () => {
    const rows = parseGieStorageResponse({
      dataset: "EU",
      data: [
        {
          code: "eu",
          gasDayStart: "2026-01-03",
          gasDayEnd: "2026-01-04",
          full: "60.4",
          gasInStorage: "690.0975",
          workingGasVolume: "1142.6223",
          updatedAt: "2026-03-02 08:11:33",
          status: "C",
          trend: "-0.56"
        }
      ]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      engineKey: "oil_shock",
      feedKey: "physical_stress.eu_gas_storage",
      seriesKey: "physical_stress.eu_gas_storage",
      releaseKey: "gie:eu:2026-01-03",
      asOfDate: "2026-01-03",
      observedAt: "2026-01-03",
      unit: "ratio"
    });
    expect(rows[0]?.value).toBeCloseTo(0.396, 3);
    expect(rows[0]?.metadata.fullnessPct).toBe(60.4);
    expect(rows[0]?.metadata.gasInStorage).toBe(690.0975);
    expect(rows[0]?.metadata.sourceCode).toBe("eu");
  });

  it("falls back to gasInStorage divided by workingGasVolume when full is missing", () => {
    const rows = parseGieStorageResponse({
      dataset: "EU",
      data: [
        {
          gasDayStart: "2026-01-04",
          gasDayEnd: "2026-01-05",
          gasInStorage: "571.311",
          workingGasVolume: "1142.622",
          updatedAt: "2026-03-02 08:11:33"
        }
      ]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBeCloseTo(0.5, 6);
  });
});
