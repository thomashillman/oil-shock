import { normalizePoints } from "../../core/normalize";
import { getSeasonalBaselines, loadThresholds, writeSeasonalBaselines } from "../../db/client";
import type { Env } from "../../env";
import type { NormalizedPoint, ScoringThresholds } from "../../types";
import { instrumentedFetch } from "../../lib/api-instrumentation";
import {
  computeSeasonalBaselines,
  evaluateSeasonalBreach,
  seasonalBreachSeriesKey,
  type RawObservation
} from "./seasonal-baseline";

export const EIA_PROVIDER = "EIA";
export const EIA_INVENTORY_FEED_NAME = "eia_inventory";
export const EIA_INVENTORY_SERIES_ID = "WCESTUS1";
export const EIA_INVENTORY_SERIES_KEY = "physical_stress.inventory_draw";
export const EIA_INVENTORY_OBSERVATION_ENGINE_KEY = "energy";
export const EIA_INVENTORY_OBSERVATION_FEED_KEY = EIA_INVENTORY_SERIES_KEY;
export const EIA_INVENTORY_LIVE_BRIDGE = "eia_inventory_weekly_collect_v1";

export interface EiaSeriesRow {
  period?: string;
  value?: string | number;
  units?: string;
  "series-description"?: string;
}

export interface EiaSeriesResponse {
  response?: {
    total?: number;
    data?: EiaSeriesRow[];
  };
  warning?: string;
  error?: string;
}

export interface EiaInventoryObservation {
  engineKey: typeof EIA_INVENTORY_OBSERVATION_ENGINE_KEY;
  feedKey: typeof EIA_INVENTORY_OBSERVATION_FEED_KEY;
  seriesKey: typeof EIA_INVENTORY_SERIES_KEY;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
  unit: "ratio";
  metadata: {
    provider: typeof EIA_PROVIDER;
    seriesId: typeof EIA_INVENTORY_SERIES_ID;
    seriesDescription: string | null;
    units: string | null;
    upstreamPeriod: string;
    inventoryMbb: number;
    windowMinMbb: number;
    windowMaxMbb: number;
    bridge: string;
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

function trailingWindow(size: number): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - size * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function seriesObservedAt(period: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(period) ? period : null;
}

function inventoryStress(current: number, windowMin: number, windowMax: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(windowMin) || !Number.isFinite(windowMax)) {
    return 0.5;
  }
  if (windowMax <= windowMin) {
    return 0.5;
  }

  return clamp01(1 - (current - windowMin) / (windowMax - windowMin));
}

export function buildInventoryObservations(rows: EiaSeriesRow[], bridge: string): EiaInventoryObservation[] {
  const sorted = rows
    .map((row) => ({
      period: typeof row.period === "string" ? row.period : null,
      value: toNumeric(row.value),
      row
    }))
    .filter((item): item is { period: string; value: number; row: EiaSeriesRow } => item.period !== null && item.value !== null)
    .sort((left, right) => left.period.localeCompare(right.period));

  const observations: EiaInventoryObservation[] = [];
  const rolling: number[] = [];

  for (const item of sorted) {
    rolling.push(item.value);
    const window = rolling.slice(-52);
    const windowMin = Math.min(...window);
    const windowMax = Math.max(...window);
    const observedAt = seriesObservedAt(item.period);
    if (!observedAt) {
      continue;
    }

    observations.push({
      engineKey: EIA_INVENTORY_OBSERVATION_ENGINE_KEY,
      feedKey: EIA_INVENTORY_OBSERVATION_FEED_KEY,
      seriesKey: EIA_INVENTORY_SERIES_KEY,
      releaseKey: `energy:${EIA_INVENTORY_SERIES_KEY}:${item.period}`,
      asOfDate: observedAt,
      observedAt,
      value: inventoryStress(item.value, windowMin, windowMax),
      unit: "ratio",
      metadata: {
        provider: EIA_PROVIDER,
        seriesId: EIA_INVENTORY_SERIES_ID,
        seriesDescription: typeof item.row["series-description"] === "string" ? item.row["series-description"] : null,
        units: typeof item.row.units === "string" ? item.row.units : null,
        upstreamPeriod: item.period,
        inventoryMbb: item.value,
        windowMinMbb: windowMin,
        windowMaxMbb: windowMax,
        bridge
      }
    });
  }

  return observations;
}

export async function collectEiaInventory(
  env: Env,
  nowIso: string,
  thresholds?: ScoringThresholds
): Promise<NormalizedPoint[]> {
  const resolvedThresholds = thresholds ?? (await loadThresholds(env));
  // Pull enough history to build a 5-year seasonal baseline (plus a small buffer).
  const { startDate, endDate } = trailingWindow(Math.ceil(resolvedThresholds.seasonalBaselineYears * 365) + 30);
  const url = new URL("https://api.eia.gov/v2/petroleum/stoc/wstk/data");
  url.searchParams.set("api_key", env.EIA_API_KEY);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", EIA_INVENTORY_SERIES_ID);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "asc");
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", "5000");

  const response = await instrumentedFetch<EiaSeriesResponse>(env, url.toString(), EIA_INVENTORY_FEED_NAME, EIA_PROVIDER, {
    timeout: 30000,
    retries: 2,
    backoffMs: 125,
    rateLimitDelayMs: 125
  });

  const observations = buildInventoryObservations(response.response?.data ?? [], EIA_INVENTORY_LIVE_BRIDGE);
  const latest = observations.at(-1);
  if (!latest) {
    return [];
  }

  // Compare the recent crude-inventory level against its 5-year seasonal norm. Lower inventory
  // than the prior-years' seasonal average means a tighter physical system -> a breach.
  const rawHistory: RawObservation[] = observations.map((obs) => ({
    observedAt: obs.observedAt,
    value: obs.metadata.inventoryMbb
  }));
  const latestYear = Number(latest.observedAt.slice(0, 4));
  const baselines = computeSeasonalBaselines(rawHistory, "week", { excludeYear: latestYear });
  await writeSeasonalBaselines(env, EIA_INVENTORY_SERIES_KEY, baselines);
  // Evaluate against the persisted baselines (this run's upsert merged with prior runs).
  const persistedBaselines = await getSeasonalBaselines(env, EIA_INVENTORY_SERIES_KEY);
  const breach = evaluateSeasonalBreach(rawHistory, persistedBaselines, {
    granularity: "week",
    rollingCount: Math.max(1, Math.round(resolvedThresholds.physicalRollingWeeks))
  });

  return normalizePoints("eia", [
    {
      seriesKey: latest.seriesKey,
      observedAt: latest.observedAt || nowIso,
      value: latest.value,
      unit: latest.unit
    },
    {
      seriesKey: seasonalBreachSeriesKey(EIA_INVENTORY_SERIES_KEY),
      observedAt: latest.observedAt || nowIso,
      value: breach.breached ? 1 : 0,
      unit: "index"
    }
  ]);
}
