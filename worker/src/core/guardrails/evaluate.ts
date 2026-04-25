import type { FreshnessSummary } from "../../types";

export interface GuardrailInputs {
  freshness: FreshnessSummary;
  feedCompleteness: Record<string, boolean>;
}

export interface GuardrailResult {
  flags: string[];
}

export function evaluateGuardrails(inputs: GuardrailInputs): GuardrailResult {
  const flags: string[] = [];

  for (const [dimension, status] of Object.entries(inputs.freshness)) {
    if (status === "stale") {
      flags.push(`stale_dimension:${dimension}`);
    }
    if (status === "missing") {
      flags.push(`missing_dimension:${dimension}`);
    }
  }

  for (const [feedKey, hasValue] of Object.entries(inputs.feedCompleteness)) {
    if (!hasValue) {
      flags.push(`missing_feed:${feedKey}`);
    }
  }

  return { flags };
}
