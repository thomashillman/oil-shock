import type { Env } from "../env";
import type { NormalizedPoint } from "../types";
import { writeSeriesPoints, startRun, finishRun } from "../db/client";
import { listEnabledFeedKeys, listRegisteredFeeds, upsertObservation, recordFeedCheck } from "../db/macro";
import { toAppError } from "../lib/errors";
import { log } from "../lib/logging";
import { collectEnergy } from "./collectors/energy";
import { collectGieStorage, GIE_FEED_KEY } from "./collectors/gie";
import { collectEiaRefinery, EIA_REFINERY_OBSERVATION_FEED_KEY } from "./collectors/eia-refinery";
import { collectEiaInventory, EIA_INVENTORY_OBSERVATION_FEED_KEY } from "./collectors/eia-inventory";
import { collectEiaFuturesCurve, EIA_FUTURES_CURVE_OBSERVATION_FEED_KEY } from "./collectors/eia-futures-curve";
import { collectCpi, type CpiObservationCandidate } from "./collectors/cpi";

async function writeNormalizedObservations(
  env: Env,
  engineKey: string,
  points: NormalizedPoint[],
  runKey: string,
  nowIso: string,
  bridge: string
): Promise<void> {
  const [registeredFeeds, enabledFeedKeys] = await Promise.all([
    listRegisteredFeeds(env, engineKey),
    listEnabledFeedKeys(env, engineKey)
  ]);
  const enabledFeedKeySet = new Set(enabledFeedKeys);
  const filterByRegistry = registeredFeeds.length > 0;

  for (const point of points) {
    const asOfDate = point.observedAt.split("T")[0] ?? point.observedAt;
    const feedKey = point.seriesKey;
    if (filterByRegistry && !enabledFeedKeySet.has(feedKey)) {
      continue;
    }
    const releaseKey = `${engineKey}:${point.seriesKey}:${point.observedAt}`;

    await upsertObservation(env, {
      engineKey,
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
        bridge
      }
    });

    await recordFeedCheck(env, {
      engineKey,
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

type EnergyCollectorSpec = {
  enabled: boolean;
  label: string;
  collect: () => Promise<NormalizedPoint[]>;
};

type OptionalCollectorResult = EnergyCollectorSpec & {
  feedKey: string;
  points: NormalizedPoint[];
  errorMessage: string | null;
};

async function settleCollector(spec: EnergyCollectorSpec): Promise<NormalizedPoint[]> {
  if (!spec.enabled) {
    return [];
  }

  try {
    return await spec.collect();
  } catch (error) {
    log("error", spec.label, { error: String(error) });
    return [];
  }
}

async function settleOptionalCollector(feedKey: string, spec: EnergyCollectorSpec): Promise<OptionalCollectorResult> {
  if (!spec.enabled) {
    return { ...spec, feedKey, points: [], errorMessage: null };
  }

  try {
    return { ...spec, feedKey, points: await spec.collect(), errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", spec.label, { error: message });
    return { ...spec, feedKey, points: [], errorMessage: message };
  }
}

async function recordOptionalCollectorCheck(
  env: Env,
  runKey: string,
  nowIso: string,
  collector: OptionalCollectorResult,
  bridge: string
): Promise<void> {
  if (!collector.enabled || collector.points.length > 0) {
    return;
  }

  await recordFeedCheck(env, {
    engineKey: "energy",
    feedKey: collector.feedKey,
    runKey,
    step: "collect",
    result: "error",
    status: "error",
    checkedAt: nowIso,
    errorMessage: collector.errorMessage ?? "Collector returned no observations.",
    details: {
      bridge,
      pointCount: 0
    }
  });
}

export async function runCollection(env: Env, now = new Date()): Promise<void> {
  const runKey = `collect-${now.getTime()}`;
  const nowIso = now.toISOString();
  await startRun(env, runKey, "collect");
  log("info", "Starting collection run", { runKey, nowIso });
  try {
    const [enabledEnergyFeedKeys, enabledCpiFeedKeys] = await Promise.all([
      listEnabledFeedKeys(env, "energy"),
      listEnabledFeedKeys(env, "cpi")
    ]);
    const [energyPoints, gieCollector, refineryCollector, inventoryCollector, futuresCurveCollector] = await Promise.all([
      settleCollector({ enabled: true, label: "Energy collector failed", collect: () => collectEnergy(env, nowIso) }),
      settleOptionalCollector(GIE_FEED_KEY, {
        enabled: enabledEnergyFeedKeys.includes(GIE_FEED_KEY),
        label: "GIE collector failed",
        collect: () => collectGieStorage(env, nowIso)
      }),
      settleOptionalCollector(EIA_REFINERY_OBSERVATION_FEED_KEY, {
        enabled: enabledEnergyFeedKeys.includes(EIA_REFINERY_OBSERVATION_FEED_KEY),
        label: "EIA refinery collector failed",
        collect: () => collectEiaRefinery(env, nowIso)
      }),
      settleOptionalCollector(EIA_INVENTORY_OBSERVATION_FEED_KEY, {
        enabled: enabledEnergyFeedKeys.includes(EIA_INVENTORY_OBSERVATION_FEED_KEY),
        label: "EIA inventory collector failed",
        collect: () => collectEiaInventory(env, nowIso)
      }),
      settleOptionalCollector(EIA_FUTURES_CURVE_OBSERVATION_FEED_KEY, {
        enabled: enabledEnergyFeedKeys.includes(EIA_FUTURES_CURVE_OBSERVATION_FEED_KEY),
        label: "EIA futures curve collector failed",
        collect: () => collectEiaFuturesCurve(env, nowIso)
      })
    ]);

    const giePoints = gieCollector.points;
    const refineryPoints = refineryCollector.points;
    const inventoryPoints = inventoryCollector.points;
    const futuresCurvePoints = futuresCurveCollector.points;
    const points = [...energyPoints, ...giePoints, ...refineryPoints, ...inventoryPoints, ...futuresCurvePoints];

    await writeSeriesPoints(env, points);
    const observationBatches = [
      { points: energyPoints, bridge: "energy_series_points_dual_write_v1" },
      { points: giePoints, bridge: "gie_storage_dual_write_v1" },
      { points: refineryPoints, bridge: "eia_refinery_monthly_dual_write_v1" },
      { points: inventoryPoints, bridge: "eia_inventory_weekly_dual_write_v1" },
      { points: futuresCurvePoints, bridge: "eia_futures_curve_daily_dual_write_v1" }
    ];

    for (const batch of observationBatches) {
      if (batch.points.length === 0) {
        continue;
      }

      await writeNormalizedObservations(env, "energy", batch.points, runKey, nowIso, batch.bridge);
    }

    await Promise.all([
      recordOptionalCollectorCheck(env, runKey, nowIso, gieCollector, "gie_storage_dual_write_v1"),
      recordOptionalCollectorCheck(
        env,
        runKey,
        nowIso,
        refineryCollector,
        "eia_refinery_monthly_dual_write_v1"
      ),
      recordOptionalCollectorCheck(
        env,
        runKey,
        nowIso,
        inventoryCollector,
        "eia_inventory_weekly_dual_write_v1"
      ),
      recordOptionalCollectorCheck(
        env,
        runKey,
        nowIso,
        futuresCurveCollector,
        "eia_futures_curve_daily_dual_write_v1"
      )
    ]);

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
