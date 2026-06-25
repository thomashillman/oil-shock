import { normalizePoints } from "../../core/normalize";
import { loadThresholds, writeSeasonalBaselines } from "../../db/client";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";
import { instrumentedFetch } from "../../lib/api-instrumentation";
import {
  computeSeasonalBaselines,
  evaluateSeasonalBreach,
  seasonalBreachSeriesKey,
  type RawObservation
} from "./seasonal-baseline";

export const GIE_PROVIDER = "GIE";
export const GIE_FEED_KEY = "physical_stress.eu_gas_storage";
export const GIE_SERIES_KEY = "physical_stress.eu_gas_storage";
export const GIE_OBSERVATION_ENGINE_KEY = "oil_shock";
export const GIE_OBSERVATION_FEED_KEY = "physical_stress.eu_gas_storage";

export interface GieStorageDataRow {
  name?: string;
  code?: string;
  url?: string;
  updatedAt?: string;
  gasDayStart?: string;
  gasDayEnd?: string;
  gasInStorage?: string | number;
  consumption?: string | number;
  consumptionFull?: string | number;
  injection?: string | number;
  withdrawal?: string | number;
  netWithdrawal?: string | number;
  workingGasVolume?: string | number;
  injectionCapacity?: string | number;
  withdrawalCapacity?: string | number;
  contractedCapacity?: string | number;
  availableCapacity?: string | number;
  coveredCapacity?: string | number;
  status?: string;
  trend?: string | number;
  full?: string | number;
  info?: unknown[];
}

export interface GieStorageResponse {
  last_page?: number;
  total?: number;
  dataset?: string;
  gas_day?: string;
  data?: GieStorageDataRow[];
  error?: string;
  message?: string;
}

export interface GieStorageObservation {
  engineKey: typeof GIE_OBSERVATION_ENGINE_KEY;
  feedKey: typeof GIE_OBSERVATION_FEED_KEY;
  seriesKey: typeof GIE_SERIES_KEY;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
  unit: "ratio";
  metadata: {
    provider: typeof GIE_PROVIDER;
    dataset: string;
    sourceCode: string | null;
    updatedAt: string | null;
    gasDayEnd: string | null;
    gasInStorage: number | null;
    fullnessPct: number | null;
    trend: number | null;
    status: string | null;
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toClampedRatio(fullnessPct: number): number {
  return clamp01(1 - fullnessPct / 100);
}

function rollingWindow(days: number): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { startDate, endDate };
}

export function parseGieStorageResponse(response: unknown): GieStorageObservation[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const typed = response as GieStorageResponse;
  const dataset = typeof typed.dataset === "string" && typed.dataset.length > 0 ? typed.dataset : "EU";
  const rows = typed.data;

  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const observations: GieStorageObservation[] = [];

  for (const row of rows) {
    if (!row || typeof row.gasDayStart !== "string" || row.gasDayStart.length === 0) {
      continue;
    }

    const fullnessPct = toNumeric(row.full);
    const gasInStorage = toNumeric(row.gasInStorage);
    const workingGasVolume = toNumeric(row.workingGasVolume);
    const fallbackFullnessPct =
      fullnessPct ??
      (gasInStorage !== null && workingGasVolume !== null && workingGasVolume > 0
        ? (gasInStorage / workingGasVolume) * 100
        : null);

    if (fallbackFullnessPct === null) {
      continue;
    }

    const observedAt = row.gasDayStart;
    observations.push({
      engineKey: GIE_OBSERVATION_ENGINE_KEY,
      feedKey: GIE_OBSERVATION_FEED_KEY,
      seriesKey: GIE_SERIES_KEY,
      releaseKey: `gie:${dataset.toLowerCase()}:${observedAt}`,
      asOfDate: observedAt,
      observedAt,
      value: toClampedRatio(fallbackFullnessPct),
      unit: "ratio",
      metadata: {
        provider: GIE_PROVIDER,
        dataset,
        sourceCode: typeof row.code === "string" ? row.code : null,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
        gasDayEnd: typeof row.gasDayEnd === "string" ? row.gasDayEnd : null,
        gasInStorage,
        fullnessPct,
        trend: toNumeric(row.trend),
        status: typeof row.status === "string" ? row.status : null
      }
    });
  }

  return observations.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

export async function collectGieStorage(env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const thresholds = await loadThresholds(env);
  // Pull enough daily history to build a 5-year seasonal baseline (plus a small buffer).
  const { startDate, endDate } = rollingWindow(Math.ceil(thresholds.seasonalBaselineYears * 365) + 30);
  const url = new URL("https://agsi.gie.eu/api");
  url.searchParams.set("type", "eu");
  url.searchParams.set("from", startDate);
  url.searchParams.set("to", endDate);
  url.searchParams.set("page", "1");
  url.searchParams.set("size", "3000");

  const response = await instrumentedFetch<GieStorageResponse>(env, url.toString(), "gie_storage", GIE_PROVIDER, {
    timeout: 30000,
    retries: 2,
    backoffMs: 125,
    rateLimitDelayMs: 125,
    headers: {
      "x-key": env.GIE_API_KEY
    }
  });

  const observations = parseGieStorageResponse(response);
  const latestObservation = observations.at(-1);
  if (!latestObservation) {
    return [];
  }

  // Storage fullness % is recoverable from the stored stress ratio (value = 1 - fullness/100).
  // Compare the recent fill against its 5-year seasonal norm by ISO week; lower fill than the
  // prior-years' seasonal average means tighter European supply -> a breach.
  const rawHistory: RawObservation[] = observations.map((obs) => ({
    observedAt: obs.observedAt,
    value: (1 - obs.value) * 100
  }));
  const latestYear = Number(latestObservation.observedAt.slice(0, 4));
  const baselines = computeSeasonalBaselines(rawHistory, "week", { excludeYear: latestYear });
  await writeSeasonalBaselines(env, GIE_SERIES_KEY, baselines);
  const breach = evaluateSeasonalBreach(rawHistory, baselines, {
    granularity: "week",
    rollingCount: Math.max(1, Math.round(thresholds.physicalRollingWeeks) * 7)
  });

  const points = [
    {
      seriesKey: GIE_SERIES_KEY,
      observedAt: latestObservation.observedAt || nowIso,
      value: latestObservation.value,
      unit: latestObservation.unit,
      sourceKey: "gie"
    },
    {
      seriesKey: seasonalBreachSeriesKey(GIE_SERIES_KEY),
      observedAt: latestObservation.observedAt || nowIso,
      value: breach.breached ? 1 : 0,
      unit: "index",
      sourceKey: "gie"
    }
  ];

  return normalizePoints("gie", points);
}
