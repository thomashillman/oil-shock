import type { RuleContext, RuleDefinitionV2, RuleEngineStore, RuleResult } from "./types-v2";

export async function runRuleEngineV2(input: {
  context: RuleContext;
  rules: RuleDefinitionV2[];
  store: RuleEngineStore;
}): Promise<{ results: RuleResult[] }> {
  const results: RuleResult[] = [];

  for (const rule of input.rules) {
    const result = await rule.evaluate(input.context);
    results.push(result);

    for (const stateUpdate of result.stateUpdates) {
      await input.store.upsertRuleState({
        engineKey: input.context.engineKey,
        ruleKey: result.ruleKey,
        stateKey: stateUpdate.stateKey,
        releaseKey: input.context.releaseKey,
        state: stateUpdate.state,
        evaluatedAt: input.context.evaluatedAt
      });
    }

    if (result.triggerEvent) {
      await input.store.insertTriggerEvent({
        engineKey: input.context.engineKey,
        ruleKey: result.ruleKey,
        releaseKey: input.context.releaseKey,
        transitionKey: result.triggerEvent.transitionKey,
        previousState: result.triggerEvent.previousState,
        newState: result.triggerEvent.newState,
        runKey: input.context.runKey,
        triggeredAt: input.context.evaluatedAt,
        status: "confirmed",
        reason: result.triggerEvent.reason,
        computed: result.computed,
        details: result.triggerEvent.details
      });
    }
  }

  return { results };
}
