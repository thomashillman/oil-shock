import { describe, expect, it } from "vitest";
import { runRuleEngineV2 } from "../../../src/core/rules/engine-v2";
import type { RuleDefinitionV2 } from "../../../src/core/rules/types-v2";

describe("rule engine v2 core lifecycle", () => {
  function baseContext() {
    return {
      engineKey: "energy",
      runKey: "run-1",
      releaseKey: "2026-04-28",
      evaluatedAt: "2026-04-28T00:00:00.000Z",
      observations: {
        "energy_spread.wti_brent_spread": { value: 0.72, observedAt: "2026-04-28T00:00:00.000Z" },
        "energy_spread.diesel_wti_crack": { value: 0.66, observedAt: "2026-04-28T00:00:00.000Z" }
      },
      priorState: {}
    };
  }

  it("evaluates a rule with context and returns structured result", async () => {
    const persistedStates: Array<{ ruleKey: string; state: Record<string, unknown> }> = [];
    const insertedEvents: Array<{ ruleKey: string; transitionKey: string }> = [];

    const rule: RuleDefinitionV2 = {
      ruleKey: "energy.confirmation.spread_widening",
      evaluate: async (context) => ({
        ruleKey: "energy.confirmation.spread_widening",
        status: "active",
        computed: {
          spread: context.observations["energy_spread.wti_brent_spread"]?.value ?? null
        },
        stateUpdates: [
          {
            stateKey: "current",
            state: { status: "active" }
          }
        ],
        triggerEvent: {
          transitionKey: "inactive->active",
          previousState: "inactive",
          newState: "active"
        }
      })
    };

    const output = await runRuleEngineV2({
      context: baseContext(),
      rules: [rule],
      store: {
        upsertRuleState: async ({ ruleKey, state }) => {
          persistedStates.push({ ruleKey, state });
        },
        insertTriggerEvent: async ({ ruleKey, transitionKey }) => {
          insertedEvents.push({ ruleKey, transitionKey });
        }
      }
    });

    expect(output.results).toHaveLength(1);
    expect(output.results[0]).toMatchObject({
      ruleKey: "energy.confirmation.spread_widening",
      status: "active"
    });
    expect(persistedStates).toEqual([{ ruleKey: "energy.confirmation.spread_widening", state: { status: "active" } }]);
    expect(insertedEvents).toEqual([{ ruleKey: "energy.confirmation.spread_widening", transitionKey: "inactive->active" }]);
  });

  it("returns no_data when required observations are missing and emits no trigger", async () => {
    const events: string[] = [];

    const rule: RuleDefinitionV2 = {
      ruleKey: "energy.confirmation.spread_widening",
      evaluate: async (context) => {
        if (!context.observations["energy_spread.diesel_wti_crack"]) {
          return {
            ruleKey: "energy.confirmation.spread_widening",
            status: "no_data",
            computed: { missing: ["energy_spread.diesel_wti_crack"] },
            stateUpdates: [
              {
                stateKey: "current",
                state: { status: "no_data" }
              }
            ]
          };
        }

        return {
          ruleKey: "energy.confirmation.spread_widening",
          status: "active",
          computed: {},
          stateUpdates: []
        };
      }
    };

    const context = baseContext();
    delete context.observations["energy_spread.diesel_wti_crack"];

    const output = await runRuleEngineV2({
      context,
      rules: [rule],
      store: {
        upsertRuleState: async () => undefined,
        insertTriggerEvent: async () => {
          events.push("emitted");
        }
      }
    });

    expect(output.results[0]?.status).toBe("no_data");
    expect(events).toHaveLength(0);
  });

  it("does not create duplicate trigger events for same release replay", async () => {
    const dedupe = new Set<string>();

    const rule: RuleDefinitionV2 = {
      ruleKey: "energy.confirmation.spread_widening",
      evaluate: async () => ({
        ruleKey: "energy.confirmation.spread_widening",
        status: "active",
        computed: {},
        stateUpdates: [{ stateKey: "current", state: { status: "active" } }],
        triggerEvent: {
          transitionKey: "inactive->active",
          previousState: "inactive",
          newState: "active"
        }
      })
    };

    const store = {
      upsertRuleState: async () => undefined,
      insertTriggerEvent: async ({ engineKey, ruleKey, releaseKey, transitionKey }: { engineKey: string; ruleKey: string; releaseKey: string; transitionKey: string }) => {
        dedupe.add(`${engineKey}:${ruleKey}:${releaseKey}:${transitionKey}`);
      }
    };

    await runRuleEngineV2({ context: baseContext(), rules: [rule], store });
    await runRuleEngineV2({ context: baseContext(), rules: [rule], store });

    expect(dedupe.size).toBe(1);
  });

  it("emits one trigger on inactive to active transition then suppresses duplicate active replay", async () => {
    const inserted: string[] = [];

    const rule: RuleDefinitionV2 = {
      ruleKey: "energy.confirmation.spread_widening",
      evaluate: async (context) => {
        const shouldEmit = context.priorState.current?.status !== "active";
        return {
          ruleKey: "energy.confirmation.spread_widening",
          status: "active",
          computed: {},
          stateUpdates: [{ stateKey: "current", state: { status: "active" } }],
          triggerEvent: shouldEmit
            ? {
                transitionKey: "inactive->active",
                previousState: "inactive",
                newState: "active"
              }
            : undefined
        };
      }
    };

    const store = {
      upsertRuleState: async () => undefined,
      insertTriggerEvent: async () => {
        inserted.push("event");
      }
    };

    await runRuleEngineV2({ context: { ...baseContext(), priorState: { current: { status: "inactive" } } }, rules: [rule], store });
    await runRuleEngineV2({ context: { ...baseContext(), priorState: { current: { status: "active" } } }, rules: [rule], store });

    expect(inserted).toHaveLength(1);
  });
});
