import type { Env } from "../env";
import { createRule, getRecentSnapshotsForRescore, listActiveRules, updateRuleByKey } from "../db/client";
import { json, parseJsonBody } from "../lib/http";
import { evaluateRules, isRulePredicate, type RuleDefinition } from "../core/rules/engine";
import { AppError } from "../lib/errors";

export async function handleListRules(env: Env): Promise<Response> {
  const rules = await listActiveRules(env);
  return json({ rules });
}

export async function handleUpdateRule(request: Request, env: Env, ruleKey: string): Promise<Response> {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  const engineKey = typeof body.engineKey === "string" ? body.engineKey : "oil_shock";
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

  await updateRuleByKey(env, engineKey, ruleKey, {
    weight: typeof body.weight === "number" ? body.weight : undefined,
    predicateJson,
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined
  });
  return json({ ok: true });
}

export async function handleCreateRule(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (typeof body.ruleKey !== "string" || body.ruleKey.trim().length === 0) {
    throw new AppError("ruleKey is required", 400, "BAD_REQUEST");
  }
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    throw new AppError("name is required", 400, "BAD_REQUEST");
  }
  if (typeof body.predicateJson !== "string") {
    throw new AppError("predicateJson is required", 400, "BAD_REQUEST");
  }
  let parsedPredicate: unknown;
  try {
    parsedPredicate = JSON.parse(body.predicateJson);
  } catch {
    throw new AppError("predicateJson must be valid JSON", 400, "BAD_REQUEST");
  }
  if (!isRulePredicate(parsedPredicate)) {
    throw new AppError("predicateJson is not a supported rule predicate", 400, "BAD_REQUEST");
  }
  if (typeof body.weight !== "number" || !Number.isFinite(body.weight)) {
    throw new AppError("weight is required and must be a number", 400, "BAD_REQUEST");
  }

  await createRule(env, {
    engineKey: typeof body.engineKey === "string" ? body.engineKey : "oil_shock",
    ruleKey: body.ruleKey,
    name: body.name,
    predicateJson: JSON.stringify(parsedPredicate),
    weight: body.weight,
    isActive: typeof body.isActive === "boolean" ? body.isActive : true
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
    if (candidate.weight !== undefined && (typeof candidate.weight !== "number" || !Number.isFinite(candidate.weight))) {
      throw new AppError("overrideRule.weight must be a finite number", 400, "BAD_REQUEST");
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

export async function handleRulesCompare(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  const engineKey = typeof body.engineKey === "string" ? body.engineKey : "energy";
  const physicalStress = Number(body.physicalStress ?? 0);
  const priceSignal = Number(body.priceSignal ?? 0);
  const marketResponse = Number(body.marketResponse ?? 0);

  if (![physicalStress, priceSignal, marketResponse].every((v) => Number.isFinite(v))) {
    throw new AppError("physicalStress, priceSignal, and marketResponse must be valid numbers", 400, "BAD_REQUEST");
  }

  const metrics = { physicalStress, priceSignal, marketResponse };
  const rules = await listActiveRules(env, engineKey);

  const ruledeltas = rules.map((rule) => {
    const applies = rule.predicate ? evaluateRules([rule], metrics).totalAdjustment !== 0 : false;
    const delta = evaluateRules([rule], metrics).totalAdjustment;
    return {
      ruleKey: rule.ruleKey,
      name: rule.name,
      weight: rule.weight,
      applies,
      delta
    };
  });

  const result = evaluateRules(rules, metrics);
  return json({
    engineKey,
    testMetrics: metrics,
    ruleDeltas: ruledeltas,
    totalAdjustment: result.totalAdjustment,
    allRulesApplied: result.matchedRules.length,
    expectedNewScore: Math.min(1, Math.max(0, (physicalStress + marketResponse) / 2 + result.totalAdjustment))
  });
}

export async function handleBackfillRescore(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  const requestedLimit = Number(body.limit ?? 50);
  if (!Number.isFinite(requestedLimit)) {
    throw new AppError("limit must be a finite number", 400, "BAD_REQUEST");
  }
  const limit = Math.min(250, Math.max(1, requestedLimit));
  const rows = await getRecentSnapshotsForRescore(env, limit);
  const rules = await listActiveRules(env);

  const overrideRule = body.overrideRule;
  let effectiveRules = rules;
  if (overrideRule && typeof overrideRule === "object") {
    const candidate = overrideRule as Record<string, unknown>;
    if (!isRulePredicate(candidate.predicate)) {
      throw new AppError("overrideRule.predicate is not a supported predicate", 400, "BAD_REQUEST");
    }
    if (candidate.weight !== undefined && (typeof candidate.weight !== "number" || !Number.isFinite(candidate.weight))) {
      throw new AppError("overrideRule.weight must be a finite number", 400, "BAD_REQUEST");
    }
    const override: RuleDefinition = {
      id: 0,
      engineKey: "oil_shock",
      ruleKey: typeof candidate.ruleKey === "string" ? candidate.ruleKey : "dry-run.override",
      name: typeof candidate.name === "string" ? candidate.name : "Backfill override",
      action: "adjust_mismatch",
      weight: typeof candidate.weight === "number" ? candidate.weight : 0,
      predicate: candidate.predicate
    };
    effectiveRules = [...rules.filter((rule) => rule.ruleKey !== override.ruleKey), override];
  }

  const comparisons = rows.flatMap((row) => {
    let subscores: unknown;
    try {
      subscores = JSON.parse(row.subscores_json);
    } catch {
      return [];
    }
    if (!subscores || typeof subscores !== "object") return [];
    const parsed = subscores as Record<string, unknown>;
    const metrics = {
      physicalStress: Number(parsed.physicalStress),
      priceSignal: Number(parsed.priceSignal),
      marketResponse: Number(parsed.marketResponse)
    };
    if (!Object.values(metrics).every((value) => Number.isFinite(value))) return [];

    const current = evaluateRules(rules, metrics);
    const overridden = evaluateRules(effectiveRules, metrics);

    return [
      {
        generatedAt: row.generated_at,
        baselineScore: row.mismatch_score,
        adjustmentCurrent: current.totalAdjustment,
        adjustmentOverride: overridden.totalAdjustment,
        rescoredCurrent: Math.min(1, Math.max(0, row.mismatch_score + current.totalAdjustment)),
        rescoredWithOverride: Math.min(1, Math.max(0, row.mismatch_score + overridden.totalAdjustment))
      }
    ];
  });

  return json({ comparisons });
}
