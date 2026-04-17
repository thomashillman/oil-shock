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
  getFirstTransmissionEvent
} from "../db/client";
import { evaluateFreshness } from "../core/freshness/evaluate";
import { evaluateEvidenceCoverage } from "../core/freshness/evidence-coverage";
import { computeSnapshot } from "../core/scoring/compute";
import { computeDislocationState } from "../core/scoring/state-labels";
import { computeClocks } from "../core/scoring/clocks";
import { classifyEvidence } from "../core/scoring/evidence-classifier";
import { applyLedgerAdjustments } from "../core/ledger/impact";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";
import type { DislocationState } from "../types";

function safeValue(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export async function runScore(env: Env, now = new Date()): Promise<void> {
  const runKey = `score-${now.getTime()}`;
  const nowIso = now.toISOString();
  await startRun(env, runKey, "score");
  log("info", "Starting scoring run", { runKey });
  const thresholds = await loadThresholds(env);

  try {
    const physical = await getLatestSeriesValue(env, "physical.inventory_draw");
    const utilization = await getLatestSeriesValue(env, "physical.utilization");
    const recognition = await getLatestSeriesValue(env, "recognition.curve_signal");
    const transmission = await getLatestSeriesValue(env, "transmission.crack_signal");
    const transmissionFilings = await getLatestSeriesValue(env, "transmission.impairment_mentions");

    const physicalPressure = safeValue(
      ((physical?.value ?? 0) + (utilization?.value ?? 0)) / (utilization ? 2 : 1)
    );
    const recognitionValue = safeValue(recognition?.value ?? 0);
    const transmissionValue = safeValue(
      ((transmission?.value ?? 0) + (transmissionFilings?.value ?? 0)) / (transmissionFilings ? 2 : 1)
    );

    const freshness = evaluateFreshness({
      physicalObservedAt: physical?.observedAt ?? null,
      recognitionObservedAt: recognition?.observedAt ?? null,
      transmissionObservedAt: transmission?.observedAt ?? null
    });

    // Compute initial snapshot with subscores
    let { snapshot, evidence } = computeSnapshot({
      nowIso,
      physicalPressure,
      recognition: recognitionValue,
      transmission: transmissionValue,
      physicalObservedAt: physical?.observedAt ?? null,
      recognitionObservedAt: recognition?.observedAt ?? null,
      transmissionObservedAt: transmission?.observedAt ?? null,
      freshness
    });

    // Apply ledger adjustments to mismatch score
    const ledgerEntries = await getLedgerEntries(env);
    const { adjustedMismatchScore, ledgerImpact } = applyLedgerAdjustments({
      mismatchScore: snapshot.mismatchScore,
      physicalScore: snapshot.subscores.physical,
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
        transmissionChanged: transmissionValue >= 0.5
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
        physicalScore: snapshot.subscores.physical,
        recognitionScore: snapshot.subscores.recognition,
        transmissionScore: snapshot.subscores.transmission
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

    await writeSnapshot(env, snapshot);
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
