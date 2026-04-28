import type { Env } from "../env";
import {
  finishRun,
  getLatestSeriesValue,
  startRun,
  listActiveRules,
  writeEngineScore
} from "../db/client";
import { evaluateRules } from "../core/rules/engine";
import { runEnergyRuleEngineV2 } from "../core/rules/energy-v2";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";

export function safeValue(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export async function runEnergyScore(env: Env, nowIso: string, runKey: string): Promise<void> {
  let wtiBrentSpread, dieselWtiCrack, curveSlope;
  const componentErrors: string[] = [];

  // Phase 1: Collect data with per-component error tracking
  try {
    wtiBrentSpread = await getLatestSeriesValue(env, "energy_spread.wti_brent_spread");
    dieselWtiCrack = await getLatestSeriesValue(env, "energy_spread.diesel_wti_crack");
    curveSlope = await getLatestSeriesValue(env, "price_signal.curve_slope");
  } catch (error) {
    componentErrors.push("collector");
    log("error", "Energy collector failed", { runKey, error: String(error) });
    // Continue with graceful degradation: missing data will cause early return
  }

  if (!wtiBrentSpread || !dieselWtiCrack) {
    // No data available: graceful degradation complete
    if (componentErrors.length > 0) {
      log("warn", "Energy scoring aborted: insufficient data after collector failure", { runKey, missingFeeds: ["wti_brent_spread", "diesel_wti_crack"] });
    }
    return;
  }

  // Phase 2: Keep legacy Energy score write behaviour.
  try {
    const physicalStress = safeValue(wtiBrentSpread.value);
    const marketResponse = safeValue(dieselWtiCrack.value);
    const priceSignal = safeValue(curveSlope?.value ?? 0);
    const rules = await listActiveRules(env, "energy");
    const ruleEvaluation = evaluateRules(rules, {
      physicalStress,
      priceSignal,
      marketResponse
    });

    const baseScore = safeValue((physicalStress + marketResponse) / 2);
    const scoreValue = safeValue(baseScore + ruleEvaluation.totalAdjustment);
    const flags = curveSlope ? [] : ["missing_price_confirmation"];

    // Add degradation flags if collector had errors
    if (componentErrors.includes("collector")) {
      flags.push("degraded_collector");
    }

    await writeEngineScore(env, {
      engineKey: "energy",
      feedKey: "energy.state",
      scoredAt: nowIso,
      scoreValue,
      confidence: flags.length > 0 ? 0.6 : 0.8,
      flags,
      runKey
    });

    if (componentErrors.length > 0) {
      log("warn", "Energy scoring completed with degraded components", { runKey, degradedComponents: componentErrors });
    }
  } catch (error) {
    componentErrors.push("scorer");
    log("error", "Energy scorer failed", { runKey, error: String(error), componentErrors });
    // Graceful degradation: don't re-throw, continue with stale data available for fallback
  }

  // Phase 3: Rule Engine v2 bridge lifecycle (fails closed on persistence errors).
  await runEnergyRuleEngineV2(env, {
    runKey,
    releaseKey: nowIso.slice(0, 10),
    evaluatedAt: nowIso
  });
}

export async function runScore(env: Env, now = new Date()): Promise<void> {
  const runKey = `score-${now.getTime()}`;
  const nowIso = now.toISOString();
  await startRun(env, runKey, "score");
  log("info", "Starting scoring run", { runKey });

  try {
    // Oil Shock scoring retired. Run active Macro Signals engines.
    await runEnergyScore(env, nowIso, runKey);
    await finishRun(env, runKey, "success", {
      message: "Macro Signals engines scored"
    });
    log("info", "Scoring run completed", { runKey });
  } catch (error) {
    const appError = toAppError(error);
    await finishRun(env, runKey, "failed", {
      error: appError.message,
      code: appError.code
    });
    log("error", "Scoring run failed", { runKey, error: appError.message, code: appError.code });
    throw error;
  }
}
