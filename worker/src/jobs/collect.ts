import type { Env } from "../env";
import type { NormalizedPoint } from "../types";
import { writeSeriesPoints, startRun, finishRun } from "../db/client";
import { listEnabledFeedKeys, listRegisteredFeeds, upsertObservation, recordFeedCheck } from "../db/macro";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";
import { collectEnergy } from "./collectors/energy";
import { collectCpi, type CpiObservationCandidate } from "./collectors/cpi";

async function writeEnergyObservations(
  env: Env,
  points: NormalizedPoint[],
  runKey: string,
  nowIso: string
): Promise<void> {
  const [registeredFeeds, enabledFeedKeys] = await Promise.all([
    listRegisteredFeeds(env, "energy"),
    listEnabledFeedKeys(env, "energy")
  ]);
  const enabledFeedKeySet = new Set(enabledFeedKeys);
  const filterByRegistry = registeredFeeds.length > 0;

  for (const point of points) {
    const asOfDate = point.observedAt.split("T")[0] ?? point.observedAt;
    const feedKey = point.seriesKey;
    if (filterByRegistry && !enabledFeedKeySet.has(feedKey)) {
      continue;
    }
    const releaseKey = `energy:${point.seriesKey}:${point.observedAt}`;

    await upsertObservation(env, {
      engineKey: "energy",
      feedKey,
      seriesKey: point.seriesKey,
      releaseKey,
      asOfDate,
      observedAt: point.observedAt,
      value: point.value,
      unit: point.unit,
      latencyTag: "Fast",
      runKey,
      metadata: {
        sourceKey: point.sourceKey,
        bridge: "energy_series_points_dual_write_v1"
      }
    });

    await recordFeedCheck(env, {
      engineKey: "energy",
      feedKey,
      runKey,
      step: "save_observation",
      result: "success",
      status: "ok",
      checkedAt: nowIso,
      details: {
        seriesKey: point.seriesKey,
        pointCount: 1
      }
    });
  }
}

async function writeCpiObservations(
  env: Env,
  candidates: CpiObservationCandidate[],
  enabledFeedKeys: Set<string>,
  runKey: string,
  nowIso: string
): Promise<void> {
  for (const candidate of candidates) {
    if (!enabledFeedKeys.has(candidate.feedKey)) {
      continue;
    }

    await upsertObservation(env, {
      ...candidate,
      runKey,
      latencyTag: "Delayed"
    });

    await recordFeedCheck(env, {
      engineKey: candidate.engineKey,
      feedKey: candidate.feedKey,
      runKey,
      step: "save_observation",
      result: "success",
      status: "ok",
      checkedAt: nowIso,
      details: {
        seriesKey: candidate.seriesKey,
        releaseKey: candidate.releaseKey
      }
    });
  }
}

export async function runCollection(env: Env, now = new Date()): Promise<void> {
  const runKey = `collect-${now.getTime()}`;
  const nowIso = now.toISOString();
  await startRun(env, runKey, "collect");
  log("info", "Starting collection run", { runKey, nowIso });
  try {
    const [energyResult, enabledCpiFeedKeys] = await Promise.all([
      collectEnergy(env, nowIso),
      listEnabledFeedKeys(env, "cpi")
    ]);

    const energyPoints: NormalizedPoint[] = [...energyResult];
    const points: NormalizedPoint[] = [...energyResult];

    await writeSeriesPoints(env, points);
    await writeEnergyObservations(env, energyPoints, runKey, nowIso);

    if (enabledCpiFeedKeys.length > 0) {
      const enabledCpiFeedSet = new Set(enabledCpiFeedKeys);
      try {
        const cpiCandidates = await collectCpi(env, nowIso);
        await writeCpiObservations(env, cpiCandidates, enabledCpiFeedSet, runKey, nowIso);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log("error", "CPI collector failed", { error: message });
        for (const feedKey of enabledCpiFeedSet) {
          await recordFeedCheck(env, {
            engineKey: "cpi",
            feedKey,
            runKey,
            step: "save_observation",
            result: "error",
            status: "error",
            checkedAt: nowIso,
            errorMessage: message
          });
        }
      }
    }
    await finishRun(env, runKey, "success", {
      pointCount: points.length,
      generatedAt: nowIso
    });
    log("info", "Collection run completed", { runKey, pointCount: points.length });
  } catch (error) {
    const appError = toAppError(error);
    await finishRun(env, runKey, "failed", {
      error: appError.message,
      code: appError.code
    });
    log("error", "Collection run failed", { runKey, error: appError.message, code: appError.code });
    throw error;
  }
}
