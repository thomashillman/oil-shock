import type { TriggerEventRow } from "../../db/macro";

export interface GuardrailCheckResult {
  key: string;
  status: "passed" | "blocked" | "ignored" | "not_configured" | "error";
  reason: string;
}

export interface GuardrailPolicyResult {
  decision: "allowed" | "blocked" | "ignored" | "error";
  actionType: "log_only";
  checks: GuardrailCheckResult[];
  rationale: string;
  details: Record<string, unknown>;
}

export interface GuardrailContext {
  event: TriggerEventRow;
  duplicateDecisionExists: boolean;
  sameRuleReleaseDecisionExists: boolean;
}
