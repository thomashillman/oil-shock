import type { Env } from "../../env";
import {
  hasActionLogDecisionForKey,
  hasActionLogDecisionForRuleRelease,
  insertActionLog,
  listConfirmedTriggerEvents
} from "../../db/macro";
import { decisionKeyForTriggerEvent } from "./energy-actions";
import { evaluateEnergyGuardrailPolicy } from "../guardrails/energy-policy";
import type { ActionDecisionDraft, ActionManagerResult } from "./types";

function emptyResult(): ActionManagerResult {
  return {
    processedCount: 0,
    skippedCount: 0,
    allowedCount: 0,
    blockedCount: 0,
    ignoredCount: 0,
    errorCount: 0
  };
}

function increment(result: ActionManagerResult, draft: ActionDecisionDraft): void {
  result.processedCount += 1;
  if (draft.decision === "allowed") result.allowedCount += 1;
  if (draft.decision === "blocked") result.blockedCount += 1;
  if (draft.decision === "ignored") result.ignoredCount += 1;
  if (draft.decision === "error") result.errorCount += 1;
}

export async function runActionManagerForEngine(
  env: Env,
  input: { engineKey: string; nowIso: string }
): Promise<ActionManagerResult> {
  const events = await listConfirmedTriggerEvents(env, input.engineKey);
  if (events.length === 0) {
    return emptyResult();
  }

  const result = emptyResult();

  for (const event of events) {
    if (input.engineKey !== "energy") {
      continue;
    }

    const decisionKey = decisionKeyForTriggerEvent(event);
    const duplicateDecisionExists = await hasActionLogDecisionForKey(env, {
      engineKey: input.engineKey,
      decisionKey
    });
    const sameRuleReleaseDecisionExists = await hasActionLogDecisionForRuleRelease(env, {
      engineKey: input.engineKey,
      ruleKey: event.ruleKey,
      releaseKey: event.releaseKey,
      decisionKey
    });
    const policy = evaluateEnergyGuardrailPolicy({
      event,
      duplicateDecisionExists,
      sameRuleReleaseDecisionExists
    });
    const draft: ActionDecisionDraft = {
      engineKey: event.engineKey,
      ruleKey: event.ruleKey,
      releaseKey: event.releaseKey,
      decisionKey,
      decision: policy.decision,
      actionType: policy.actionType,
      rationale: policy.rationale,
      details: {
        ...policy.details,
        checks: policy.checks,
        transitionKey: event.transitionKey,
        previousState: event.previousState,
        newState: event.newState
      }
    };

    if (duplicateDecisionExists) {
      result.skippedCount += 1;
      increment(result, draft);
      continue;
    }

    await insertActionLog(env, {
      engineKey: draft.engineKey,
      ruleKey: draft.ruleKey,
      releaseKey: draft.releaseKey,
      decisionKey: draft.decisionKey,
      decision: draft.decision,
      actionType: draft.actionType,
      rationale: draft.rationale,
      details: draft.details,
      decidedAt: input.nowIso
    });

    increment(result, draft);
  }

  return result;
}
