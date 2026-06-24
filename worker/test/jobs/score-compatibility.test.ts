import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import { writeOilShockCompatibilitySnapshot } from "../../src/jobs/score-compatibility";
import { handleGetState } from "../../src/routes/state";
import { createTestEnv } from "../helpers/fake-d1";

describe("Oil Shock compatibility snapshot", () => {
  it("refreshes the snapshot contract consumed by the frontend", async () => {
    const env = createTestEnv() as unknown as Env;
    const now = new Date("2026-06-23T12:00:00.000Z");

    await writeOilShockCompatibilitySnapshot(env, now, "score-compatibility", {
      physicalStress: 0.7,
      priceSignal: 0.2,
      marketResponse: 0.6,
      physicalStressPoint: {
        seriesKey: "energy_spread.wti_brent_spread",
        observedAt: "2026-06-23T00:00:00.000Z",
        value: 0.7,
        unit: "index",
        sourceKey: "energy"
      },
      priceSignalPoint: {
        seriesKey: "price_signal.curve_slope",
        observedAt: "2026-06-23T00:00:00.000Z",
        value: 0.2,
        unit: "index",
        sourceKey: "eia"
      },
      marketResponsePoint: {
        seriesKey: "energy_spread.diesel_wti_crack",
        observedAt: "2026-06-23T00:00:00.000Z",
        value: 0.6,
        unit: "index",
        sourceKey: "energy"
      }
    });

    const response = await handleGetState(new Request("http://local/api/state"), env);
    const state = (await response.json()) as {
      generatedAt: string;
      subscores: Record<string, number>;
    };

    expect(response.status).toBe(200);
    expect(state.generatedAt).toBe(now.toISOString());
    expect(state.subscores).toEqual({
      physicalStress: 0.7,
      priceSignal: 0.2,
      marketResponse: 0.6
    });
  });
});
