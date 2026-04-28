import type { TriggerEventRow } from "../../db/macro";
import type { ActionDecisionDraft } from "./types";

const SUPPORTED_RULE_KEY = "energy.confirmation.spread_widening";
const SUPPORTED_TRANSITION_KEY = "inactive->active";

function decisionKeyFor(event: TriggerEventRow): string {
  return `${event.engineKey}:${event.ruleKey}:${event.releaseKey}:${event.transitionKey}`;
}

export function buildEnergyActionDecision(event: TriggerEventRow): ActionDecisionDraft | null {
  if (event.engineKey !== "energy") {
    return null;
  }

  if (event.details !== null && typeof event.details !== "object") {
    return {
      engineKey: event.engineKey,
      ruleKey: event.ruleKey,
      releaseKey: event.releaseKey,
      decisionKey: decisionKeyFor(event),
      decision: "error",
      actionType: "log_only",
      rationale: "logging-only bridge received malformed trigger details; no trade execution",
      details: { transitionKey: event.transitionKey }
    };
  }

  if (event.ruleKey === SUPPORTED_RULE_KEY && event.transitionKey === SUPPORTED_TRANSITION_KEY) {
    return {
      engineKey: event.engineKey,
      ruleKey: event.ruleKey,
      releaseKey: event.releaseKey,
      decisionKey: decisionKeyFor(event),
      decision: "allowed",
      actionType: "log_only",
      rationale: "logging-only bridge accepted confirmed trigger event; no trade execution occurred",
      details: {
        transitionKey: event.transitionKey,
        previousState: event.previousState,
        newState: event.newState
      }
    };
  }

  return {
    engineKey: event.engineKey,
    ruleKey: event.ruleKey,
    releaseKey: event.releaseKey,
    decisionKey: decisionKeyFor(event),
    decision: "ignored",
    actionType: "log_only",
    rationale: "logging-only bridge has no execution policy configured for this trigger",
    details: { transitionKey: event.transitionKey }
  };
}
