import type { Env } from "../env";
import {
  finishRun,
  getLatestSeriesValue,
  loadThresholds,
  startRun,
  listActiveRules,
  writeEngineScore
} from "../db/client";
import { evaluateRules } from "../core/rules/engine";
import { runEnergyRuleEngineV2 } from "../core/rules/energy-v2";
import { EIA_INVENTORY_SERIES_KEY } from "./collectors/eia-inventory";
import { EIA_REFINERY_SERIES_KEY } from "./collectors/eia-refinery";
import { GIE_SERIES_KEY } from "./collectors/gie";
import { seasonalBreachSeriesKey } from "./collectors/seasonal-baseline";
import { runActionManagerForEngine } from "../core/actions/action-manager";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";
import {
  writeOilShockCompatibilitySnapshot,
  type EnergyScoreInputs
} from "./score-compatibility";

export function safeValue(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export interface EnergyDislocationScoreInputs {
  /** Evidence the physical energy system is tightening (0-1). Currently the WTI-Brent spread. */
  physicalStress: number;
  /** Stress transmitting into downstream products/margins (0-1). Currently the diesel-WTI crack. */
  transmissionStress: number;
  /**
   * How much current pricing already reflects the physical stress (0-1), or null when the
   * price signal is unavailable. Currently proxied by the futures curve slope.
   */
  marketRecognition: number | null;
  /** Bounded weight applied to the downstream transmission contribution. */
  mismatchMarketResponseWeight: number;
  /** Sum of rule-based adjustments to apply to the score. */
  ruleAdjustment: number;
}

export interface EnergyDislocationScoreResult {
  scoreValue: number;
  flags: string[];
  confidence: number;
}

/**
 * Live Energy "hidden dislocation" score.
 *
 * The product thesis is that physical energy stress is worsening faster than market pricing
 * recognises. We therefore score the UNRECOGNISED portion of physical stress rather than raw
 * stress: high physical stress that the market already prices in (high recognition) is a weak
 * signal, while high physical stress the market is ignoring (low recognition) is a strong one.
 *
 * Missing market recognition is treated as UNKNOWN, not as "the market is ignoring the shock"
 * (which would be a false positive at recognition = 0) and not as "the market fully recognises
 * the shock" (a false negative at recognition = 1). We split the difference at 0.5, flag the gap
 * with `missing_price_confirmation`, and lower confidence so downstream consumers can see the
 * score is provisional.
 *
 * Transmission stress (downstream products) only contributes a small, bounded amount so it can
 * never push the score to a watch/actionable level on its own.
 */
export function computeEnergyDislocationScore(
  inputs: EnergyDislocationScoreInputs
): EnergyDislocationScoreResult {
  const { physicalStress, transmissionStress, marketRecognition, mismatchMarketResponseWeight, ruleAdjustment } = inputs;

  // Physical stress enters the mismatch quadratically rather than linearly: risk does not grow
  // smoothly with physical tightness, it accelerates as the system approaches a genuine shortage.
  // Squaring keeps low/moderate stress muted while letting extreme physical stress dominate.
  const squaredPhysicalStress = Math.pow(physicalStress, 2);
  const hiddenMismatch =
    marketRecognition === null
      ? squaredPhysicalStress * 0.5
      : squaredPhysicalStress * (1 - marketRecognition);

  const scoreValue = safeValue(
    hiddenMismatch + transmissionStress * mismatchMarketResponseWeight + ruleAdjustment
  );

  const flags = marketRecognition === null ? ["missing_price_confirmation"] : [];
  const confidence = flags.length > 0 ? 0.6 : 0.8;

  return { scoreValue, flags, confidence };
}

export async function runEnergyScore(
  env: Env,
  nowIso: string,
  runKey: string
): Promise<EnergyScoreInputs | null> {
  let wtiBrentSpread, dieselWtiCrack, curveSlope;
  const componentErrors: string[] = [];
  let legacyScoreSucceeded = true;

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
    return null;
  }

  let scoreInputs: EnergyScoreInputs | null = null;
  // Phase 2: Write the live Energy "hidden dislocation" score.
  try {
    const thresholds = await loadThresholds(env);

    // physicalStress base: physical crude constraint (WTI-Brent spread).
    const basePhysicalStress = safeValue(wtiBrentSpread.value);
    // Latent physical-supply baseline: each physical feed (crude inventory, refinery utilisation,
    // EU gas storage) that has breached its 5-year seasonal norm adds a bounded penalty to physical
    // stress. Missing breach feeds contribute nothing (conservative). The penalty is applied before
    // the [0,1] clamp via safeValue, so several simultaneous breaches lift physical stress but can
    // never push it past 1. The breach reads are best-effort: the penalty is an optional refinement,
    // so a transient read failure degrades to zero penalty rather than aborting the whole score.
    let seasonalBreachCount = 0;
    try {
      const breachPoints = await Promise.all([
        getLatestSeriesValue(env, seasonalBreachSeriesKey(EIA_INVENTORY_SERIES_KEY)),
        getLatestSeriesValue(env, seasonalBreachSeriesKey(EIA_REFINERY_SERIES_KEY)),
        getLatestSeriesValue(env, seasonalBreachSeriesKey(GIE_SERIES_KEY))
      ]);
      seasonalBreachCount = breachPoints.filter((point) => point !== null && point.value >= 0.5).length;
    } catch (error) {
      log("warn", "Seasonal-breach reads failed; applying zero physical-baseline penalty", {
        runKey,
        error: String(error)
      });
    }
    const physicalStress = safeValue(
      basePhysicalStress + thresholds.physicalBaselinePenaltyWeight * seasonalBreachCount
    );
    // transmissionStress: downstream product/margin stress (diesel-WTI crack). Secondary signal.
    const transmissionStress = safeValue(dieselWtiCrack.value);
    // marketRecognition: how much pricing already reflects the stress, or null when the price feed
    // is missing. The futures curve slope is INVERTED here: contango (high curve_slope) means the
    // market is relaxed about near-term supply, while deep backwardation (low curve_slope) is the
    // market actively pricing near-term tightness, i.e. high recognition. Missing is treated as
    // UNKNOWN, never as 0 or 1, so it can neither manufacture a false positive nor silently confirm
    // full recognition.
    const hasPriceSignal = Boolean(curveSlope);
    const marketRecognition = hasPriceSignal ? safeValue(1 - safeValue(curveSlope?.value ?? null)) : null;

    scoreInputs = {
      physicalStress,
      // Pass a neutral 0.5 (unknown) into the compatibility path when recognition is missing
      // rather than 0, which would falsely maximise the compatibility mismatch.
      priceSignal: marketRecognition ?? 0.5,
      marketResponse: transmissionStress,
      priceSignalWasMissing: marketRecognition === null,
      physicalStressPoint: wtiBrentSpread,
      priceSignalPoint: curveSlope ?? null,
      marketResponsePoint: dieselWtiCrack
    };

    const rules = await listActiveRules(env, "energy");
    const ruleEvaluation = evaluateRules(rules, {
      physicalStress,
      // Neutral 0.5 keeps a missing price signal from firing recognition-gap rules.
      priceSignal: marketRecognition ?? 0.5,
      marketResponse: transmissionStress
    });

    const { scoreValue, flags, confidence } = computeEnergyDislocationScore({
      physicalStress,
      transmissionStress,
      marketRecognition,
      mismatchMarketResponseWeight: thresholds.mismatchMarketResponseWeight,
      ruleAdjustment: ruleEvaluation.totalAdjustment
    });

    // Add degradation flags if collector had errors, and keep confidence conservative.
    let effectiveConfidence = confidence;
    if (componentErrors.includes("collector")) {
      flags.push("degraded_collector");
      effectiveConfidence = Math.min(effectiveConfidence, 0.6);
    }

    await writeEngineScore(env, {
      engineKey: "energy",
      feedKey: "energy.state",
      scoredAt: nowIso,
      scoreValue,
      confidence: effectiveConfidence,
      flags,
      runKey
    });

    if (componentErrors.length > 0) {
      log("warn", "Energy scoring completed with degraded components", { runKey, degradedComponents: componentErrors });
    }
  } catch (error) {
    componentErrors.push("scorer");
    legacyScoreSucceeded = false;
    log("error", "Energy scorer failed", { runKey, error: String(error), componentErrors });
    // Graceful degradation: don't re-throw, continue with stale data available for fallback
  }

  if (!legacyScoreSucceeded) {
    return null;
  }

  // Phase 3: Rule Engine v2 bridge lifecycle (fails closed on persistence errors).
  const ruleEngineResult = await runEnergyRuleEngineV2(env, {
    runKey,
    releaseKey: nowIso.slice(0, 10),
    evaluatedAt: nowIso
  });

  // Phase 4: Action Manager logging bridge (logging-only, fail-closed on persistence errors).
  if (!ruleEngineResult.results.some((result) => Boolean(result.triggerEvent))) {
    return scoreInputs;
  }

  await runActionManagerForEngine(env, {
    engineKey: "energy",
    nowIso
  });
  return scoreInputs;
}

export async function runScore(env: Env, now = new Date()): Promise<void> {
  const runKey = `score-${now.getTime()}`;
  const nowIso = now.toISOString();
  await startRun(env, runKey, "score");
  log("info", "Starting scoring run", { runKey });

  try {
    const energyInputs = await runEnergyScore(env, nowIso, runKey);
    let compatibilitySnapshot = null;
    if (energyInputs) {
      try {
        compatibilitySnapshot = await writeOilShockCompatibilitySnapshot(env, now, runKey, energyInputs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log("error", "Oil Shock compatibility snapshot failed", {
          runKey,
          error: message
        });
      }
    }
    await finishRun(env, runKey, "success", {
      message: "Macro Signals engines scored",
      compatibilitySnapshotGeneratedAt: compatibilitySnapshot?.generatedAt ?? null
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
