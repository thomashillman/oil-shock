import {
  getFeedHealthSummary,
  listRuntimeActions,
  listRuntimeObservations,
  listRuntimeRuleState,
  listRuntimeTriggerEvents
} from "../db/macro";
import type { Env } from "../env";
import { json } from "../lib/http";

const ENERGY_ENGINE_KEY = "energy";
const RUNTIME_LIMIT = 25;

export async function handleEngineList(): Promise<Response> {
  return json({
    engines: [
      {
        engineKey: ENERGY_ENGINE_KEY,
        displayName: "Energy",
        status: "active",
        runtimeChain: ["observations", "rule_state", "trigger_events", "guardrail_policy", "action_log"]
      }
    ]
  });
}

export async function handleEnergyRuntime(env: Env): Promise<Response> {
  const [feedHealth, observations, ruleState, triggerEvents, actions] = await Promise.all([
    getFeedHealthSummary(env, ENERGY_ENGINE_KEY),
    listRuntimeObservations(env, ENERGY_ENGINE_KEY, RUNTIME_LIMIT),
    listRuntimeRuleState(env, ENERGY_ENGINE_KEY, RUNTIME_LIMIT),
    listRuntimeTriggerEvents(env, ENERGY_ENGINE_KEY, RUNTIME_LIMIT),
    listRuntimeActions(env, ENERGY_ENGINE_KEY, RUNTIME_LIMIT)
  ]);

  return json({
    engineKey: ENERGY_ENGINE_KEY,
    feedHealth: feedHealth.map((feed) => ({
      engineKey: feed.engineKey,
      feedKey: feed.feedKey,
      displayName: feed.displayName,
      enabled: feed.enabled,
      status: feed.status,
      latestCheck: feed.latestCheck
        ? {
            checkedAt: feed.latestCheck.checkedAt,
            step: feed.latestCheck.step,
            result: feed.latestCheck.result,
            status: feed.latestCheck.status,
            errorMessage: feed.latestCheck.errorMessage,
            latencyMs: feed.latestCheck.latencyMs
          }
        : null
    })),
    observations,
    ruleState,
    triggerEvents,
    actions,
    metadata: {
      readOnly: true,
      cpiEnabled: false,
      generatedAt: new Date().toISOString()
    }
  });
}

export function handleUnknownRuntimeEngine(engineKey: string): Response {
  return json(
    {
      error: "not_found",
      message: `Runtime is not available for engine '${engineKey}'.`
    },
    { status: 404 }
  );
}

export function handleRuntimeMethodNotAllowed(): Response {
  return json(
    {
      error: "method_not_allowed",
      message: "Method not allowed. Use GET."
    },
    { status: 405 }
  );
}
