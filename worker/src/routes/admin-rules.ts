import type { Env } from "../env";
import { listActiveRules, updateRuleByKey } from "../db/client";
import { json, parseJsonBody } from "../lib/http";
import { evaluateRules, isRulePredicate, type RuleDefinition } from "../core/rules/engine";
import { AppError } from "../lib/errors";

export async function handleListRules(env: Env): Promise<Response> {
  const rules = await listActiveRules(env);
  return json({ rules });
}

export async function handleUpdateRule(request: Request, env: Env, ruleKey: string): Promise<Response> {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  let predicateJson: string | undefined;
  if (typeof body.predicateJson === "string") {
    let parsedPredicate: unknown;
    try {
      parsedPredicate = JSON.parse(body.predicateJson);
    } catch {
      throw new AppError("predicateJson must be valid JSON", 400, "BAD_REQUEST");
    }
    if (!isRulePredicate(parsedPredicate)) {
      throw new AppError("predicateJson is not a supported rule predicate", 400, "BAD_REQUEST");
    }
    predicateJson = JSON.stringify(parsedPredicate);
  }

  await updateRuleByKey(env, ruleKey, {
    weight: typeof body.weight === "number" ? body.weight : undefined,
    predicateJson,
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined
  });
  return json({ ok: true });
}

export async function handleRulesDryRun(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  const physicalStress = Number(body.physicalStress);
  const priceSignal = Number(body.priceSignal);
  const marketResponse = Number(body.marketResponse);

  if (![physicalStress, priceSignal, marketResponse].every((v) => Number.isFinite(v))) {
    throw new AppError("physicalStress, priceSignal, and marketResponse are required numbers", 400, "BAD_REQUEST");
  }

  const rules = await listActiveRules(env);
  const overrideRule = body.overrideRule;
  let effectiveRules = rules;
  if (overrideRule && typeof overrideRule === "object") {
    const candidate = overrideRule as Record<string, unknown>;
    if (!isRulePredicate(candidate.predicate)) {
      throw new AppError("overrideRule.predicate is not a supported predicate", 400, "BAD_REQUEST");
    }
    const override: RuleDefinition = {
      id: 0,
      engineKey: "oil_shock",
      ruleKey: typeof candidate.ruleKey === "string" ? candidate.ruleKey : "dry-run.override",
      name: typeof candidate.name === "string" ? candidate.name : "Dry run override",
      action: "adjust_mismatch",
      weight: typeof candidate.weight === "number" ? candidate.weight : 0,
      predicate: candidate.predicate
    };
    effectiveRules = [
      ...rules.filter((rule) => rule.ruleKey !== override.ruleKey),
      override
    ];
  }

  const result = evaluateRules(effectiveRules, { physicalStress, priceSignal, marketResponse });
  return json(result);
}
