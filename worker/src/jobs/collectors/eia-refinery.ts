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
export const EIA_REFINERY_FEED_NAME = "eia_refinery";
export const EIA_REFINERY_SERIES_ID = "MOPUEUS2";
export const EIA_REFINERY_SERIES_KEY = "physical_stress.refinery_utilization";
export const EIA_REFINERY_OBSERVATION_ENGINE_KEY = "energy";
export const EIA_REFINERY_OBSERVATION_FEED_KEY = EIA_REFINERY_SERIES_KEY;
export const EIA_REFINERY_LIVE_BRIDGE = "eia_refinery_monthly_collect_v1";

export interface EiaMonthlySeriesRow {
  period?: string;
  value?: string | number;
  units?: string;
  "series-description"?: string;
}

export interface EiaMonthlySeriesResponse {
  response?: {
    total?: number;
    data?: EiaMonthlySeriesRow[];
  };
  warning?: string;
  error?: string;
}

export interface EiaRefineryObservation {
  engineKey: typeof EIA_REFINERY_OBSERVATION_ENGINE_KEY;
  feedKey: typeof EIA_REFINERY_OBSERVATION_FEED_KEY;
  seriesKey: typeof EIA_REFINERY_SERIES_KEY;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
  unit: "ratio";
  metadata: {
    provider: typeof EIA_PROVIDER;
    seriesId: typeof EIA_REFINERY_SERIES_ID;
    seriesDescription: string | null;
    units: string | null;
    upstreamPeriod: string;
    utilizationPct: number;
    stressValue: number;
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

function monthlyObservedAt(period: string): string | null {
  if (/^\d{4}-\d{2}$/.test(period)) {
    return period;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return period;
  }

  return null;
}

function toRefineryStressValue(utilizationPct: number): number {
  return clamp01(1 - utilizationPct / 100);
}

function sortRows(rows: EiaMonthlySeriesRow[]): EiaMonthlySeriesRow[] {
  return [...rows].sort((left, right) => String(left.period ?? "").localeCompare(String(right.period ?? "")));
}

export function buildRefineryObservations(
  rows: EiaMonthlySeriesRow[],
  bridge: string
): EiaRefineryObservation[] {
  const observations: EiaRefineryObservation[] = [];

  for (const row of sortRows(rows)) {
    const period = typeof row.period === "string" ? row.period : null;
    const utilizationPct = toNumeric(row.value);
    if (!period || utilizationPct === null) {
      continue;
    }

    const observedAt = monthlyObservedAt(period);
    if (!observedAt) {
      continue;
    }

    const stressValue = toRefineryStressValue(utilizationPct);
    observations.push({
      engineKey: EIA_REFINERY_OBSERVATION_ENGINE_KEY,
      feedKey: EIA_REFINERY_OBSERVATION_FEED_KEY,
      seriesKey: EIA_REFINERY_SERIES_KEY,
      releaseKey: `energy:${EIA_REFINERY_SERIES_KEY}:${period}`,
      asOfDate: observedAt,
      observedAt,
      value: stressValue,
      unit: "ratio",
      metadata: {
        provider: EIA_PROVIDER,
        seriesId: EIA_REFINERY_SERIES_ID,
        seriesDescription: typeof row["series-description"] === "string" ? row["series-description"] : null,
        units: typeof row.units === "string" ? row.units : null,
        upstreamPeriod: period,
        utilizationPct,
        stressValue,
        bridge
      }
    });
  }

  return observations;
}

export async function collectEiaRefinery(
  env: Env,
  nowIso: string,
  thresholds?: ScoringThresholds
): Promise<NormalizedPoint[]> {
  const resolvedThresholds = thresholds ?? (await loadThresholds(env));
  const endDate = nowIso.slice(0, 10);
  // Pull enough monthly history to build a 5-year seasonal baseline (plus a small buffer).
  const windowMs = (Math.ceil(resolvedThresholds.seasonalBaselineYears * 365) + 30) * 24 * 60 * 60 * 1000;
  const startDate = new Date(Date.parse(nowIso) - windowMs).toISOString().slice(0, 10);
  const url = new URL("https://api.eia.gov/v2/petroleum/pnp/unc/data");
  url.searchParams.set("api_key", env.EIA_API_KEY);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", EIA_REFINERY_SERIES_ID);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", "5000");

  const response = await instrumentedFetch<EiaMonthlySeriesResponse>(env, url.toString(), EIA_REFINERY_FEED_NAME, EIA_PROVIDER, {
    timeout: 30000,
    retries: 2,
    backoffMs: 125,
    rateLimitDelayMs: 125
  });

  const observations = buildRefineryObservations(response.response?.data ?? [], EIA_REFINERY_LIVE_BRIDGE);
  const latestObservation = observations.at(-1);
  if (!latestObservation) {
    return [];
  }

  // Refinery utilisation is monthly, so the "rolling reading" is the latest month compared against
  // the same month's 5-year seasonal average. Lower utilisation than the seasonal norm = a breach.
  const rawHistory: RawObservation[] = observations.map((obs) => ({
    observedAt: obs.observedAt,
    value: obs.metadata.utilizationPct
  }));
  const latestYear = Number(latestObservation.observedAt.slice(0, 4));
  const baselines = computeSeasonalBaselines(rawHistory, "month", { excludeYear: latestYear });
  await writeSeasonalBaselines(env, EIA_REFINERY_SERIES_KEY, baselines);
  // Evaluate against the persisted baselines (this run's upsert merged with prior runs).
  const persistedBaselines = await getSeasonalBaselines(env, EIA_REFINERY_SERIES_KEY);
  const breach = evaluateSeasonalBreach(rawHistory, persistedBaselines, { granularity: "month", rollingCount: 1 });

  return normalizePoints("eia", [
    {
      seriesKey: latestObservation.seriesKey,
      observedAt: latestObservation.observedAt,
      value: latestObservation.value,
      unit: latestObservation.unit
    },
    {
      seriesKey: seasonalBreachSeriesKey(EIA_REFINERY_SERIES_KEY),
      observedAt: latestObservation.observedAt,
      value: breach.breached ? 1 : 0,
      unit: "index"
    }
  ]);
}
