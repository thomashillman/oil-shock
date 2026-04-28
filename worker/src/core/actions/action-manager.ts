import type { Env } from "../../env";
import { insertActionLog, listUnloggedConfirmedTriggerEvents } from "../../db/macro";
import { buildEnergyActionDecision } from "./energy-actions";
import type { ActionDecisionDraft, ActionManagerResult } from "./types";

function emptyResult(): ActionManagerResult {
  return {
    processedCount: 0,
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
  const events = await listUnloggedConfirmedTriggerEvents(env, input.engineKey);
  if (events.length === 0) {
    return emptyResult();
  }

  const result = emptyResult();

  for (const event of events) {
    const draft = input.engineKey === "energy" ? buildEnergyActionDecision(event) : null;
    if (!draft) {
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
