import { describe, expect, it } from "vitest";
import { runEnergyRuleEngineV2 } from "../../../src/core/rules/energy-v2";

describe("energy rule engine v2", () => {
  function makeEnv(observations: Array<{ series_key: string; value: number; observed_at: string; release_key: string }>) {
    const writes = { ruleState: 0, triggerEvents: 0 };

    return {
      env: {
        APP_ENV: "local",
        EIA_API_KEY: "",
        GIE_API_KEY: "",
        DB: {
          prepare(query: string) {
            const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
            return {
              bind(...params: unknown[]) {
                return {
                  async all<T>() {
                    if (normalized.includes("from observations")) {
                      return {
                        results: observations
                          .filter((row) => row.series_key === params[1] || row.series_key === params[2])
                          .map((row) => ({
                            engine_key: "energy",
                            feed_key: row.series_key,
                            series_key: row.series_key,
                            release_key: row.release_key,
                            as_of_date: row.release_key,
                            observed_at: row.observed_at,
                            value: row.value
                          })) as T[]
                      };
                    }
                    throw new Error(`Unhandled all query: ${query}`);
                  },
                  async first<T>() {
                    if (normalized.includes("from rule_state")) {
                      return null as T | null;
                    }
                    throw new Error(`Unhandled first query: ${query}`);
                  },
                  async run() {
                    if (normalized.includes("insert into rule_state")) writes.ruleState += 1;
                    if (normalized.includes("insert or ignore into trigger_events")) writes.triggerEvents += 1;
                    return { success: true, meta: { last_row_id: 1 } };
                  }
                };
              }
            };
          }
        }
      } as any,
      writes
    };
  }

  it("reads Energy observations and writes rule state", async () => {
    const { env, writes } = makeEnv([
      { series_key: "energy_spread.wti_brent_spread", value: 0.7, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.68, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" }
    ]);

    const result = await runEnergyRuleEngineV2(env, {
      runKey: "run-1",
      evaluatedAt: "2026-04-28T00:00:00.000Z",
      releaseKey: "2026-04-28"
    });

    expect(result.results[0]?.status).toBe("active");
    expect(writes.ruleState).toBeGreaterThan(0);
  });

  it("emits trigger event row only when thresholds are crossed", async () => {
    const activeCase = makeEnv([
      { series_key: "energy_spread.wti_brent_spread", value: 0.9, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.8, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" }
    ]);
    const inactiveCase = makeEnv([
      { series_key: "energy_spread.wti_brent_spread", value: 0.2, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.2, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" }
    ]);

    const active = await runEnergyRuleEngineV2(activeCase.env, {
      runKey: "run-1",
      evaluatedAt: "2026-04-28T00:00:00.000Z",
      releaseKey: "2026-04-28"
    });
    const inactive = await runEnergyRuleEngineV2(inactiveCase.env, {
      runKey: "run-2",
      evaluatedAt: "2026-04-28T00:00:00.000Z",
      releaseKey: "2026-04-28"
    });

    expect(active.results[0]?.triggerEvent).toBeTruthy();
    expect(inactive.results[0]?.triggerEvent).toBeUndefined();
    expect(activeCase.writes.triggerEvents).toBe(1);
    expect(inactiveCase.writes.triggerEvents).toBe(0);
  });

  it("exposes temporary bridge thresholds in computed output", async () => {
    const { env } = makeEnv([
      { series_key: "energy_spread.wti_brent_spread", value: 0.61, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" },
      { series_key: "energy_spread.diesel_wti_crack", value: 0.56, observed_at: "2026-04-28T00:00:00.000Z", release_key: "2026-04-28" }
    ]);

    const result = await runEnergyRuleEngineV2(env, {
      runKey: "run-bridge-thresholds",
      evaluatedAt: "2026-04-28T00:00:00.000Z",
      releaseKey: "2026-04-28"
    });

    expect(result.results[0]?.computed).toMatchObject({
      wtiBrentThresholdSource: "temporary_bridge_constant",
      dieselWtiThresholdSource: "temporary_bridge_constant"
    });
  });
});
