import type { Env } from "../env";
import {
  finishRun,
  getLatestSeriesValue,
  startRun,
  writeRunEvidence,
  writeSnapshot
} from "../db/client";
import { evaluateFreshness } from "../core/freshness/evaluate";
import { computeSnapshot } from "../core/scoring/compute";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";

function safeValue(value: number | null): number {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export async function runScore(env: Env, now = new Date()): Promise<void> {
  const runKey = `score-${now.getTime()}`;
  await startRun(env, runKey, "score");
  log("info", "Starting scoring run", { runKey });

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

    const { snapshot, evidence } = computeSnapshot({
      nowIso: now.toISOString(),
      physicalPressure,
      recognition: recognitionValue,
      transmission: transmissionValue,
      physicalObservedAt: physical?.observedAt ?? null,
      recognitionObservedAt: recognition?.observedAt ?? null,
      transmissionObservedAt: transmission?.observedAt ?? null,
      freshness
    });

    await writeSnapshot(env, snapshot);
    await writeRunEvidence(env, runKey, evidence);
    await finishRun(env, runKey, "success", {
      mismatchScore: snapshot.mismatchScore,
      actionabilityState: snapshot.actionabilityState
    });
    log("info", "Scoring run completed", {
      runKey,
      mismatchScore: snapshot.mismatchScore,
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
