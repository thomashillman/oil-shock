import type { Env } from "../env";
import {
  finishRun,
  getLatestSeriesValue,
  startRun,
  writeRunEvidence,
  writeSnapshot,
  getLatestStateChangeEvent,
  writeSateChangeEvent,
  getLedgerEntries,
  loadThresholds,
  getFirstNonAlignedStateEvent,
  getFirstTransmissionEvent,
  listActiveRules,
  writeEngineScore
} from "../db/client";
import { evaluateFreshness } from "../core/freshness/evaluate";
import { evaluateEvidenceCoverage } from "../core/freshness/evidence-coverage";
import { computeSnapshot } from "../core/scoring/compute";
import { computeDislocationState } from "../core/scoring/state-labels";
import { computeClocks } from "../core/scoring/clocks";
import { classifyEvidence } from "../core/scoring/evidence-classifier";
import { applyLedgerAdjustments } from "../core/ledger/impact";
import { evaluateRules } from "../core/rules/engine";
import { evaluateGuardrails } from "../core/guardrails/evaluate";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";
import type { DislocationState } from "../types";

function safeValue(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function avgSafe(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return 0;
  return safeValue(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function newestObservedAt(...rows: ({ observedAt: string } | null)[]): string | null {
  const timestamps = rows
    .filter((r): r is { observedAt: string } => r !== null)
    .map((r) => r.observedAt);
  if (timestamps.length === 0) return null;
  return timestamps.reduce((latest, ts) => (ts > latest ? ts : latest));
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
  const thresholds = await loadThresholds(env);

  try {
    // physical_stress: EIA crude stocks + refinery utilization + ENTSOG flows + GIE storage
    const inventoryDraw = await getLatestSeriesValue(env, "physical_stress.inventory_draw");
    const refineryUtil = await getLatestSeriesValue(env, "physical_stress.refinery_utilization");
    const euPipelineFlow = await getLatestSeriesValue(env, "physical_stress.eu_pipeline_flow");
    const euGasStorage = await getLatestSeriesValue(env, "physical_stress.eu_gas_storage");

    // price_signal: WTI spot + futures curve slope
    const spotWti = await getLatestSeriesValue(env, "price_signal.spot_wti");
    const curveSlope = await getLatestSeriesValue(env, "price_signal.curve_slope");

    // market_response: 3:2:1 crack spread + SEC impairment filings
    const crackSpread = await getLatestSeriesValue(env, "market_response.crack_spread");
    const secImpairment = await getLatestSeriesValue(env, "market_response.sec_impairment");

    const physicalStress = avgSafe([
      inventoryDraw?.value ?? null,
      refineryUtil?.value ?? null,
      euPipelineFlow?.value ?? null,
      euGasStorage?.value ?? null
    ]);

    const priceSignal = avgSafe([
      spotWti?.value ?? null,
      curveSlope?.value ?? null
    ]);

    const marketResponse = avgSafe([
      crackSpread?.value ?? null,
      secImpairment?.value ?? null
    ]);

    const physicalStressObservedAt = newestObservedAt(inventoryDraw, refineryUtil, euPipelineFlow, euGasStorage);
    const priceSignalObservedAt = newestObservedAt(spotWti, curveSlope);
    const marketResponseObservedAt = newestObservedAt(crackSpread, secImpairment);

    const freshness = evaluateFreshness({
      physicalStressObservedAt,
      priceSignalObservedAt,
      marketResponseObservedAt
    });
    const guardrails = evaluateGuardrails({
      freshness,
      feedCompleteness: {
        "physical_stress.inventory_draw": inventoryDraw !== null,
        "physical_stress.refinery_utilization": refineryUtil !== null,
        "physical_stress.eu_pipeline_flow": euPipelineFlow !== null,
        "physical_stress.eu_gas_storage": euGasStorage !== null,
        "price_signal.spot_wti": spotWti !== null,
        "price_signal.curve_slope": curveSlope !== null,
        "market_response.crack_spread": crackSpread !== null,
        "market_response.sec_impairment": secImpairment !== null
      }
    });
    const rules = await listActiveRules(env);
    const ruleEvaluation = evaluateRules(rules, {
      physicalStress,
      priceSignal,
      marketResponse
    });

    // Compute initial snapshot with subscores
    let { snapshot, evidence } = computeSnapshot({
      nowIso,
      physicalStress,
      priceSignal,
      marketResponse,
      physicalStressObservedAt,
      priceSignalObservedAt,
      marketResponseObservedAt,
      freshness,
      thresholds
    });
    snapshot.guardrailFlags = guardrails.flags;
    snapshot.mismatchScore = Math.max(0, Math.min(1, snapshot.mismatchScore + ruleEvaluation.totalAdjustment));

    // Apply ledger adjustments to mismatch score
    const ledgerEntries = await getLedgerEntries(env);
    const { adjustedMismatchScore, ledgerImpact } = applyLedgerAdjustments({
      mismatchScore: snapshot.mismatchScore,
      physicalStress: snapshot.subscores.physicalStress,
      ledgerEntries,
      nowIso,
      thresholds
    });
    snapshot.mismatchScore = adjustedMismatchScore;
    snapshot.ledgerImpact = ledgerImpact;

    // Get previous state change event to compute duration
    const previousStateEvent = await getLatestStateChangeEvent(env);
    let durationInCurrentStateSeconds: number | null = null;
    if (previousStateEvent) {
      durationInCurrentStateSeconds = Math.floor((now.getTime() - new Date(previousStateEvent.generated_at).getTime()) / 1000);
    }

    // Compute dislocation state
    const { state: dislocationState, rationale: stateRationale } = computeDislocationState(
      snapshot.mismatchScore,
      snapshot.subscores,
      freshness,
      durationInCurrentStateSeconds,
      thresholds
    );
    snapshot.dislocationState = dislocationState;
    snapshot.stateRationale = stateRationale;

    // Write state change event if state changed
    if (!previousStateEvent || previousStateEvent.new_state !== dislocationState) {
      await writeSateChangeEvent(env, {
        generatedAt: nowIso,
        previousState: previousStateEvent?.new_state ?? null,
        newState: dislocationState,
        stateDurationSeconds: previousStateEvent ? durationInCurrentStateSeconds : null,
        transmissionChanged: marketResponse >= thresholds.confirmationMarketResponseMin
      });
    }

    // Compute clocks
    const firstMismatchEvent = await getFirstNonAlignedStateEvent(env);
    const firstTransmissionEvent = await getFirstTransmissionEvent(env);
    const clocks = computeClocks({
      nowIso,
      durationInCurrentStateSeconds,
      firstMismatchObservedAt: firstMismatchEvent?.generated_at ?? null,
      firstTransmissionSignalObservedAt: firstTransmissionEvent?.generated_at ?? null,
      thresholds
    });
    snapshot.clocks = clocks;

    // Classify evidence and evaluate coverage
    evidence = evidence.map((evt) => {
      const { classification, reason } = classifyEvidence({
        evidenceKey: evt.evidenceKey,
        contribution: evt.contribution,
        physicalStress: snapshot.subscores.physicalStress,
        priceSignal: snapshot.subscores.priceSignal,
        marketResponse: snapshot.subscores.marketResponse
      });

      const { coverage } = evaluateEvidenceCoverage({
        evidenceKey: evt.evidenceKey,
        freshness: freshness[evt.evidenceGroup as keyof typeof freshness]
      });

      return {
        ...evt,
        classification,
        coverage,
        reason
      };
    });

    await writeSnapshot(env, snapshot, runKey);
    await runEnergyScore(env, nowIso, runKey);
    await writeRunEvidence(env, runKey, evidence);
    await finishRun(env, runKey, "success", {
      mismatchScore: snapshot.mismatchScore,
      dislocationState: snapshot.dislocationState,
      actionabilityState: snapshot.actionabilityState
    });
    log("info", "Scoring run completed", {
      runKey,
      mismatchScore: snapshot.mismatchScore,
      dislocationState: snapshot.dislocationState,
      actionabilityState: snapshot.actionabilityState
    });
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
