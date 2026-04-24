import type { Env } from "../env";
import {
  finishRun,
  getLatestSeriesValue,
  startRun,
  loadThresholds,
  listActiveRules,
  writeEngineScore
} from "../db/client";
import { evaluateRules } from "../core/rules/engine";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";

function safeValue(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

async function runEnergyScore(env: Env, nowIso: string, runKey: string): Promise<void> {
  const wtiBrentSpread = await getLatestSeriesValue(env, "energy_spread.wti_brent_spread");
  const dieselWtiCrack = await getLatestSeriesValue(env, "energy_spread.diesel_wti_crack");
  const curveSlope = await getLatestSeriesValue(env, "price_signal.curve_slope");

  if (!wtiBrentSpread || !dieselWtiCrack) {
    return;
  }

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

  await writeEngineScore(env, {
    engineKey: "energy",
    feedKey: "energy.state",
    scoredAt: nowIso,
    scoreValue,
    confidence: flags.length > 0 ? 0.6 : 0.8,
    flags,
    runKey
  });
}

export async function runScore(env: Env, now = new Date()): Promise<void> {
  const runKey = `score-${now.getTime()}`;
  const nowIso = now.toISOString();
  await startRun(env, runKey, "score");
  log("info", "Starting scoring run", { runKey });

  try {
    // Phase 3: Oil Shock scoring retired. Only run new Macro Signals engines.
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
