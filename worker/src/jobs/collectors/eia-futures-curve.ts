import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";
import { instrumentedFetch } from "../../lib/api-instrumentation";
import type { EiaSeriesResponse, EiaSeriesRow } from "./eia-inventory";

export const EIA_PROVIDER = "EIA";
export const EIA_FUTURES_CURVE_FEED_NAME = "eia_futures_curve";
export const EIA_FUTURES_CURVE_SERIES_KEY = "price_signal.curve_slope";
export const EIA_FUTURES_CURVE_OBSERVATION_ENGINE_KEY = "energy";
export const EIA_FUTURES_CURVE_OBSERVATION_FEED_KEY = EIA_FUTURES_CURVE_SERIES_KEY;
export const EIA_FUTURES_CURVE_LIVE_BRIDGE = "eia_futures_curve_daily_collect_v1";
export const EIA_FUTURES_CONTRACT_1 = "RCLC1";
export const EIA_FUTURES_CONTRACT_4 = "RCLC4";

export interface EiaFuturesCurveObservation {
  engineKey: typeof EIA_FUTURES_CURVE_OBSERVATION_ENGINE_KEY;
  feedKey: typeof EIA_FUTURES_CURVE_OBSERVATION_FEED_KEY;
  seriesKey: typeof EIA_FUTURES_CURVE_SERIES_KEY;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
  unit: "ratio";
  metadata: {
    provider: typeof EIA_PROVIDER;
    contract1SeriesId: typeof EIA_FUTURES_CONTRACT_1;
    contract4SeriesId: typeof EIA_FUTURES_CONTRACT_4;
    seriesDescription: string | null;
    contract1Value: number;
    contract4Value: number;
    spreadValue: number;
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

function dailyWindow(days: number): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function buildFuturesCurveUrl(
  apiKey: string,
  seriesId: string,
  startDate: string,
  endDate: string,
  sortDirection: "asc" | "desc"
): string {
  const url = new URL("https://api.eia.gov/v2/petroleum/pri/fut/data");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", "daily");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", seriesId);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", sortDirection);
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", "1");
  return url.toString();
}

function normalizeCurveSlope(contract1: number, contract4: number): number {
  return clamp01(0.5 + (contract4 - contract1) / 20);
}

function indexByPeriod(rows: EiaSeriesRow[]): Map<string, EiaSeriesRow> {
  const result = new Map<string, EiaSeriesRow>();
  for (const row of rows) {
    const period = typeof row.period === "string" ? row.period : null;
    if (!period) {
      continue;
    }
    result.set(period, row);
  }
  return result;
}

export function buildFuturesCurveObservations(
  contract1Rows: EiaSeriesRow[],
  contract4Rows: EiaSeriesRow[],
  bridge: string
): EiaFuturesCurveObservation[] {
  const contract1ByPeriod = indexByPeriod(contract1Rows);
  const contract4ByPeriod = indexByPeriod(contract4Rows);
  const periods = [...contract1ByPeriod.keys()]
    .filter((period) => contract4ByPeriod.has(period))
    .sort((left, right) => left.localeCompare(right));

  const observations: EiaFuturesCurveObservation[] = [];

  for (const period of periods) {
    const contract1Row = contract1ByPeriod.get(period);
    const contract4Row = contract4ByPeriod.get(period);
    const contract1Value = toNumeric(contract1Row?.value);
    const contract4Value = toNumeric(contract4Row?.value);
    if (contract1Value === null || contract4Value === null) {
      continue;
    }

    observations.push({
      engineKey: EIA_FUTURES_CURVE_OBSERVATION_ENGINE_KEY,
      feedKey: EIA_FUTURES_CURVE_OBSERVATION_FEED_KEY,
      seriesKey: EIA_FUTURES_CURVE_SERIES_KEY,
      releaseKey: `energy:${EIA_FUTURES_CURVE_SERIES_KEY}:${period}`,
      asOfDate: period,
      observedAt: period,
      value: normalizeCurveSlope(contract1Value, contract4Value),
      unit: "ratio",
      metadata: {
        provider: EIA_PROVIDER,
        contract1SeriesId: EIA_FUTURES_CONTRACT_1,
        contract4SeriesId: EIA_FUTURES_CONTRACT_4,
        seriesDescription: typeof contract1Row?.["series-description"] === "string" ? contract1Row["series-description"] : null,
        contract1Value,
        contract4Value,
        spreadValue: contract4Value - contract1Value,
        bridge
      }
    });
  }

  return observations;
}

export async function collectEiaFuturesCurve(env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const { startDate, endDate } = dailyWindow(1200);
  const [contract1Response, contract4Response] = await Promise.all([
    instrumentedFetch<EiaSeriesResponse>(
      env,
      buildFuturesCurveUrl(env.EIA_API_KEY, EIA_FUTURES_CONTRACT_1, startDate, endDate, "desc"),
      EIA_FUTURES_CURVE_FEED_NAME,
      EIA_PROVIDER,
      {
        timeout: 30000,
        retries: 2,
        backoffMs: 125,
        rateLimitDelayMs: 125
      }
    ),
    instrumentedFetch<EiaSeriesResponse>(
      env,
      buildFuturesCurveUrl(env.EIA_API_KEY, EIA_FUTURES_CONTRACT_4, startDate, endDate, "desc"),
      EIA_FUTURES_CURVE_FEED_NAME,
      EIA_PROVIDER,
      {
        timeout: 30000,
        retries: 2,
        backoffMs: 125,
        rateLimitDelayMs: 125
      }
    )
  ]);

  const latest = buildFuturesCurveObservations(
    contract1Response.response?.data ?? [],
    contract4Response.response?.data ?? [],
    EIA_FUTURES_CURVE_LIVE_BRIDGE
  ).at(-1);
  if (!latest) {
    return [];
  }

  return [
    {
      seriesKey: latest.seriesKey,
      observedAt: latest.observedAt || nowIso,
      value: latest.value,
      unit: latest.unit,
      sourceKey: "eia"
    }
  ];
}
