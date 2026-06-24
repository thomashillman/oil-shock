import { applyLedgerAdjustments } from "../core/ledger/impact";
import { evaluateFreshness } from "../core/freshness/evaluate";
import { evaluateEvidenceCoverage } from "../core/freshness/evidence-coverage";
import { evaluateGuardrails } from "../core/guardrails/evaluate";
import { evaluateRules } from "../core/rules/engine";
import { computeClocks } from "../core/scoring/clocks";
import { computeSnapshot } from "../core/scoring/compute";
import { classifyEvidence } from "../core/scoring/evidence-classifier";
import { computeDislocationState } from "../core/scoring/state-labels";
import {
  getFirstNonAlignedStateEvent,
  getFirstTransmissionEvent,
  getLatestStateChangeEvent,
  getLedgerEntries,
  listActiveRules,
  loadThresholds,
  writeRunEvidence,
  writeSateChangeEvent,
  writeSnapshot
} from "../db/client";
import type { Env } from "../env";
import type { NormalizedPoint, StateSnapshot } from "../types";

export interface EnergyScoreInputs {
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
  physicalStressPoint: NormalizedPoint;
  priceSignalPoint: NormalizedPoint | null;
  marketResponsePoint: NormalizedPoint;
}

export async function writeOilShockCompatibilitySnapshot(
  env: Env,
  now: Date,
  runKey: string,
  inputs: EnergyScoreInputs
): Promise<StateSnapshot> {
  const nowIso = now.toISOString();
  const thresholds = await loadThresholds(env);
  const freshness = evaluateFreshness({
    physicalStressObservedAt: inputs.physicalStressPoint.observedAt,
    priceSignalObservedAt: inputs.priceSignalPoint?.observedAt ?? null,
    marketResponseObservedAt: inputs.marketResponsePoint.observedAt
  });
  const guardrails = evaluateGuardrails({
    freshness,
    feedCompleteness: {
      "energy_spread.wti_brent_spread": true,
      "price_signal.curve_slope": inputs.priceSignalPoint !== null,
      "energy_spread.diesel_wti_crack": true
    }
  });
  const rules = await listActiveRules(env, "oil_shock");
  const ruleEvaluation = evaluateRules(rules, {
    physicalStress: inputs.physicalStress,
    priceSignal: inputs.priceSignal,
    marketResponse: inputs.marketResponse
  });

  let { snapshot, evidence } = computeSnapshot({
    nowIso,
    physicalStress: inputs.physicalStress,
    priceSignal: inputs.priceSignal,
    marketResponse: inputs.marketResponse,
    physicalStressObservedAt: inputs.physicalStressPoint.observedAt,
    priceSignalObservedAt: inputs.priceSignalPoint?.observedAt ?? null,
    marketResponseObservedAt: inputs.marketResponsePoint.observedAt,
    freshness,
    thresholds
  });
  snapshot.guardrailFlags = guardrails.flags;
  snapshot.mismatchScore = Math.max(
    0,
    Math.min(1, snapshot.mismatchScore + ruleEvaluation.totalAdjustment)
  );

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

  const previousStateEvent = await getLatestStateChangeEvent(env);
  const durationInCurrentStateSeconds = previousStateEvent
    ? Math.floor((now.getTime() - new Date(previousStateEvent.generated_at).getTime()) / 1000)
    : null;
  const { state, rationale } = computeDislocationState(
    snapshot.mismatchScore,
    snapshot.subscores,
    freshness,
    durationInCurrentStateSeconds,
    thresholds
  );
  snapshot.dislocationState = state;
  snapshot.stateRationale = rationale;

  if (!previousStateEvent || previousStateEvent.new_state !== state) {
    await writeSateChangeEvent(env, {
      generatedAt: nowIso,
      previousState: previousStateEvent?.new_state ?? null,
      newState: state,
      stateDurationSeconds: durationInCurrentStateSeconds,
      transmissionChanged: inputs.marketResponse >= thresholds.confirmationMarketResponseMin
    });
  }

  const [firstMismatchEvent, firstTransmissionEvent] = await Promise.all([
    getFirstNonAlignedStateEvent(env),
    getFirstTransmissionEvent(env)
  ]);
  snapshot.clocks = computeClocks({
    nowIso,
    durationInCurrentStateSeconds,
    firstMismatchObservedAt: firstMismatchEvent?.generated_at ?? null,
    firstTransmissionSignalObservedAt: firstTransmissionEvent?.generated_at ?? null,
    thresholds
  });

  evidence = evidence.map((item) => {
    const classification = classifyEvidence({
      evidenceKey: item.evidenceKey,
      contribution: item.contribution,
      physicalStress: snapshot.subscores.physicalStress,
      priceSignal: snapshot.subscores.priceSignal,
      marketResponse: snapshot.subscores.marketResponse
    });
    const coverage = evaluateEvidenceCoverage({
      evidenceKey: item.evidenceKey,
      freshness: freshness[item.evidenceGroup]
    });
    return {
      ...item,
      classification: classification.classification,
      coverage: coverage.coverage,
      reason: classification.reason
    };
  });

  await writeSnapshot(env, snapshot, runKey);
  await writeRunEvidence(env, runKey, evidence);
  return snapshot;
}
