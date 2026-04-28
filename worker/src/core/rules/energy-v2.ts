import type { Env } from "../../env";
import {
  getRuleState,
  insertTriggerEvent,
  listLatestObservationsForEngine,
  upsertRuleState
} from "../../db/macro";
import { runRuleEngineV2 } from "./engine-v2";
import type { RuleContext, RuleDefinitionV2, RuleResult } from "./types-v2";

const ENERGY_CONFIRMATION_RULE = "energy.confirmation.spread_widening";
const WTI_BRENT_THRESHOLD = 0.6;
const DIESEL_WTI_THRESHOLD = 0.55;

function evaluateEnergyConfirmation(context: RuleContext): RuleResult {
  const spread = context.observations["energy_spread.wti_brent_spread"]?.value;
  const crack = context.observations["energy_spread.diesel_wti_crack"]?.value;

  if (typeof spread !== "number" || typeof crack !== "number") {
    return {
      ruleKey: ENERGY_CONFIRMATION_RULE,
      status: "no_data",
      computed: { spread: spread ?? null, crack: crack ?? null },
      stateUpdates: [
        {
          stateKey: "current",
          state: { status: "no_data", spread: spread ?? null, crack: crack ?? null }
        }
      ]
    };
  }

  const active = spread >= WTI_BRENT_THRESHOLD && crack >= DIESEL_WTI_THRESHOLD;
  const priorStatus = String(context.priorState.current?.status ?? "inactive");
  const nextStatus = active ? "active" : "inactive";

  return {
    ruleKey: ENERGY_CONFIRMATION_RULE,
    status: nextStatus,
    computed: {
      spread,
      crack,
      spreadThreshold: WTI_BRENT_THRESHOLD,
      crackThreshold: DIESEL_WTI_THRESHOLD
    },
    stateUpdates: [
      {
        stateKey: "current",
        state: { status: nextStatus, spread, crack }
      }
    ],
    triggerEvent:
      priorStatus !== "active" && nextStatus === "active"
        ? {
            transitionKey: "inactive->active",
            previousState: priorStatus,
            newState: "active",
            reason: "energy spreads crossed confirmation threshold"
          }
        : undefined
  };
}

export async function runEnergyRuleEngineV2(
  env: Env,
  input: { runKey: string; releaseKey: string; evaluatedAt: string }
): Promise<{ results: RuleResult[] }> {
  const observations = await listLatestObservationsForEngine(env, "energy", [
    "energy_spread.wti_brent_spread",
    "energy_spread.diesel_wti_crack"
  ]);

  const priorCurrent = await getRuleState(env, "energy", ENERGY_CONFIRMATION_RULE, "current");

  const rules: RuleDefinitionV2[] = [
    {
      ruleKey: ENERGY_CONFIRMATION_RULE,
      evaluate: async (context) => evaluateEnergyConfirmation(context)
    }
  ];

  return runRuleEngineV2({
    context: {
      engineKey: "energy",
      runKey: input.runKey,
      releaseKey: input.releaseKey,
      evaluatedAt: input.evaluatedAt,
      observations,
      priorState: {
        ...(priorCurrent ? { current: priorCurrent.state } : {})
      }
    },
    rules,
    store: {
      upsertRuleState: async (stateInput) => {
        await upsertRuleState(env, stateInput);
      },
      insertTriggerEvent: async (eventInput) => {
        await insertTriggerEvent(env, eventInput);
      }
    }
  });
}
