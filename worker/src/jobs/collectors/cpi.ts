import type { Env } from "../../env";
import fixture from "./fixtures/cpi-response.json";

const CPI_ENGINE_KEY = "cpi";
const CPI_FEED_KEY = "macro_release.us_cpi.headline_yoy";
const CPI_SERIES_KEY = "macro_release.us_cpi.headline_yoy";

interface CpiSeriesPoint {
  year?: string;
  period?: string;
  periodName?: string;
  value?: string | number;
}

interface CpiFixtureResponse {
  Results?: {
    series?: Array<{
      seriesID?: string;
      data?: CpiSeriesPoint[];
    }>;
  };
  metadata?: {
    releaseTimestamp?: string;
    releaseName?: string;
  };
}

export interface CpiObservationCandidate {
  engineKey: "cpi";
  feedKey: string;
  seriesKey: string;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
  unit: "percent";
  metadata: {
    provider: "BLS";
    sourceSeriesId: string;
    periodName?: string;
    releaseName?: string;
    bridge: "cpi_collect_only_v1";
  };
}

function toAsOfDate(year: string, period: string): string {
  const monthMatch = /^M(\d{2})$/.exec(period);
  if (!monthMatch) {
    throw new Error(`cpi parser: invalid period '${period}'`);
  }
  return `${year}-${monthMatch[1]}`;
}

export function parseCpiFixture(response: unknown): CpiObservationCandidate {
  if (!response || typeof response !== "object") {
    throw new Error("cpi parser: response must be an object");
  }

  const typed = response as CpiFixtureResponse;
  const series = typed.Results?.series;
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("cpi parser: Results.series must be a non-empty array");
  }

  const firstSeries = series[0];
  if (!firstSeries || !Array.isArray(firstSeries.data) || firstSeries.data.length === 0) {
    throw new Error("cpi parser: Results.series[0].data must be a non-empty array");
  }

  const firstPoint = firstSeries.data[0];
  if (!firstPoint) {
    throw new Error("cpi parser: missing first data point");
  }

  if (typeof firstPoint.year !== "string" || typeof firstPoint.period !== "string") {
    throw new Error("cpi parser: missing year/period in first data point");
  }

  if (firstPoint.value === undefined || firstPoint.value === null) {
    throw new Error("cpi parser: missing value in first data point");
  }
  const numericValue = Number(firstPoint.value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`cpi parser: invalid numeric value '${String(firstPoint.value)}'`);
  }

  const asOfDate = toAsOfDate(firstPoint.year, firstPoint.period);
  const observedAt = typed.metadata?.releaseTimestamp ?? `${asOfDate}-01T00:00:00.000Z`;

  return {
    engineKey: CPI_ENGINE_KEY,
    feedKey: CPI_FEED_KEY,
    seriesKey: CPI_SERIES_KEY,
    releaseKey: `cpi:${asOfDate}`,
    asOfDate,
    observedAt,
    value: numericValue,
    unit: "percent",
    metadata: {
      provider: "BLS",
      sourceSeriesId: firstSeries.seriesID ?? "unknown",
      periodName: firstPoint.periodName,
      releaseName: typed.metadata?.releaseName,
      bridge: "cpi_collect_only_v1"
    }
  };
}

export async function collectCpi(_env: Env, _nowIso: string): Promise<CpiObservationCandidate[]> {
  return [parseCpiFixture(fixture)];
}
