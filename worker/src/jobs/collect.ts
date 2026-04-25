import type { Env } from "../env";
import type { NormalizedPoint } from "../types";
import { writeSeriesPoints, startRun, finishRun } from "../db/client";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";
import { collectEnergy } from "./collectors/energy";

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
