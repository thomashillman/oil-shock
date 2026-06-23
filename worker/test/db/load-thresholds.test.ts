import { describe, expect, it } from "vitest";
import { loadThresholds } from "../../src/db/client";
import type { Env } from "../../src/env";

type ThresholdRow = { key: string; value: unknown };

const REQUIRED_ROWS: ThresholdRow[] = [
  { key: "state_aligned_threshold_max", value: 0.3 },
  { key: "state_mild_threshold_min", value: 0.3 },
  { key: "state_mild_threshold_max", value: 0.5 },
  { key: "state_persistent_threshold_min", value: 0.5 },
  { key: "state_persistent_threshold_max", value: 0.75 },
  { key: "state_deep_threshold_min", value: 0.75 },
  { key: "shock_age_threshold_hours", value: 72 },
  { key: "dislocation_persistence_threshold_hours", value: 72 },
  { key: "ledger_adjustment_magnitude", value: 0.1 },
  { key: "mismatch_market_response_weight", value: 0.15 },
  { key: "confirmation_physical_stress_min", value: 0.6 },
  { key: "confirmation_price_signal_max", value: 0.45 },
  { key: "confirmation_market_response_min", value: 0.5 },
  { key: "coverage_missing_penalty", value: 0.34 },
  { key: "coverage_stale_penalty", value: 0.16 },
  { key: "coverage_max_penalty", value: 1.0 },
  { key: "state_deep_persistence_hours", value: 120 },
  { key: "state_persistent_persistence_hours", value: 72 },
  { key: "ledger_stale_threshold_days", value: 30 }
];

function makeEnv(rows: ThresholdRow[]): Env {
  return {
    APP_ENV: "local",
    PRODUCTION_ORIGIN: "",
    EIA_API_KEY: "",
    GIE_API_KEY: "",
    DB: {
      prepare: () => ({
        all: async () => ({ results: rows })
      })
    } as unknown as D1Database
  } as Env;
}

describe("loadThresholds", () => {
  it("accepts numeric strings from config storage", async () => {
    const rows = REQUIRED_ROWS.map((row) =>
      row.key === "coverage_stale_penalty" ? { ...row, value: "0.16" } : row
    );
    const env = makeEnv(rows);

    const thresholds = await loadThresholds(env);

    expect(thresholds.coverageStalePenalty).toBe(0.16);
  });

  it("fails clearly when a required threshold key is missing", async () => {
    const env = makeEnv(REQUIRED_ROWS.filter((row) => row.key !== "coverage_stale_penalty"));

    await expect(loadThresholds(env)).rejects.toMatchObject({
      code: "MISSING_THRESHOLD"
    });
  });

  it("fails clearly when a required threshold has an invalid value", async () => {
    const rows = REQUIRED_ROWS.map((row) =>
      row.key === "coverage_stale_penalty" ? { ...row, value: Number.NaN } : row
    );
    const env = makeEnv(rows);

    await expect(loadThresholds(env)).rejects.toMatchObject({
      code: "INVALID_THRESHOLD"
    });
  });
});
