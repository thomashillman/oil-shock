import type { Env } from "../env";
import type { NormalizedPoint } from "../types";
import { writeSeriesPoints, startRun, finishRun } from "../db/client";
import { upsertObservation, recordFeedCheck } from "../db/macro";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";
import { collectEnergy } from "./collectors/energy";

async function writeEnergyObservations(
  env: Env,
  points: NormalizedPoint[],
  runKey: string,
  nowIso: string
): Promise<void> {
  for (const point of points) {
    const asOfDate = point.observedAt.split("T")[0] ?? point.observedAt;
    const feedKey = point.seriesKey;
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

export async function runCollection(env: Env, now = new Date()): Promise<void> {
  const runKey = `collect-${now.getTime()}`;
  const nowIso = now.toISOString();
  await startRun(env, runKey, "collect");
  log("info", "Starting collection run", { runKey, nowIso });
  try {
    const results = await Promise.allSettled([
      collectEnergy(env, nowIso)
    ]);
    const points: NormalizedPoint[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        points.push(...result.value);
      } else {
        log("error", "Collector failed", { error: String(result.reason) });
      }
    }
    await writeSeriesPoints(env, points);
    await writeEnergyObservations(env, points, runKey, nowIso);
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
