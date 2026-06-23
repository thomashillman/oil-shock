import type { GuardrailCheckResult, GuardrailContext, GuardrailPolicyResult } from "./types";

const SUPPORTED_RULE_KEY = "energy.confirmation.spread_widening";
const SUPPORTED_TRANSITION_KEY = "inactive->active";

function isSupportedEnergyTrigger(context: GuardrailContext): boolean {
  return (
    context.event.engineKey === "energy" &&
    context.event.ruleKey === SUPPORTED_RULE_KEY &&
    context.event.transitionKey === SUPPORTED_TRANSITION_KEY
  );
}

function hasRequiredIdentity(context: GuardrailContext): boolean {
  return Boolean(context.event.engineKey && context.event.ruleKey && context.event.releaseKey && context.event.transitionKey);
}

function withRationale(checks: GuardrailCheckResult[], rationale: string): GuardrailPolicyResult {
  return {
    decision: checks.some((check) => check.status === "error")
      ? "error"
      : checks.some((check) => check.status === "blocked")
        ? "blocked"
        : "ignored",
    actionType: "log_only",
    checks,
    rationale,
    details: {
      cooldown: { status: "not_configured" }
    }
  };
}

export function evaluateEnergyGuardrailPolicy(context: GuardrailContext): GuardrailPolicyResult {
  const checks: GuardrailCheckResult[] = [];

  if (!hasRequiredIdentity(context)) {
    checks.push({
      key: "identity_fields",
      status: "error",
      reason: "trigger event is missing required identity fields"
    });
    checks.push({ key: "cooldown", status: "not_configured", reason: "cooldown policy is not configured yet" });
    return withRationale(checks, "guardrail policy could not evaluate trigger because trigger is missing required identity fields");
  }

  if (context.duplicateDecisionExists) {
    checks.push({
      key: "duplicate_trigger",
      status: "blocked",
      reason: "this trigger decision key already has decision history"
    });
    checks.push({ key: "same_rule_release", status: "ignored", reason: "skipped because duplicate trigger decision already exists" });
    checks.push({ key: "execution_policy", status: "not_configured", reason: "execution policy is not configured for Energy" });
    checks.push({ key: "cooldown", status: "not_configured", reason: "cooldown policy is not configured yet" });
    return {
      decision: "ignored",
      actionType: "log_only",
      checks,
      rationale:
        "confirmed trigger recorded but skipped because this trigger already has decision history; no execution policy configured and no trade execution occurred",
      details: {
        cooldown: { status: "not_configured" }
      }
    };
  }

  checks.push({ key: "duplicate_trigger", status: "passed", reason: "no prior decision exists for this trigger decision key" });

  if (context.sameRuleReleaseDecisionExists) {
    checks.push({
      key: "same_rule_release",
      status: "blocked",
      reason: "a decision already exists for this engine, rule, and release"
    });
    checks.push({ key: "execution_policy", status: "not_configured", reason: "execution policy is not configured for Energy" });
    checks.push({ key: "cooldown", status: "not_configured", reason: "cooldown policy is not configured yet" });
    return withRationale(
      checks,
      "confirmed trigger recorded but blocked because the same engine, rule, and release already has a decision; no trade execution occurred"
    );
  }

  checks.push({ key: "same_rule_release", status: "passed", reason: "no prior decision exists for this engine, rule, and release" });
  checks.push({ key: "execution_policy", status: "not_configured", reason: "execution policy is not configured for Energy" });
  checks.push({ key: "cooldown", status: "not_configured", reason: "cooldown policy is not configured yet" });

  if (!isSupportedEnergyTrigger(context)) {
    return withRationale(
      checks,
      "confirmed trigger recorded but ignored because this Energy trigger is unsupported and no execution policy is configured; no trade execution occurred"
    );
  }

  return withRationale(
    checks,
    "confirmed trigger recorded; duplicate and same-rule-release guardrails checked; no execution policy configured and no trade execution occurred"
  );
}
