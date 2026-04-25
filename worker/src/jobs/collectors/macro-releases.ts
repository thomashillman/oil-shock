import { normalizePoints } from "../../core/normalize";
import type { NormalizedPoint } from "../../types";

interface BlsDataPoint {
  year: string;
  period: string;
  periodName?: string;
  value: string | number | null;
  latest?: boolean;
}

interface BlsSeries {
  seriesID: string;
  data: BlsDataPoint[];
}

interface BlsResponse {
  status?: string;
  message?: unknown[];
  Results?: {
    series: BlsSeries[];
  };
}

function toNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatYearMonth(year: string, period: string): string {
  // period format is like "M04" for April
  const monthMatch = period.match(/^M(\d{2})$/);
  if (!monthMatch) return "";
  return `${year}-${monthMatch[1]}`;
}

export function parseCpiData(response: unknown): NormalizedPoint[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const blsResponse = response as BlsResponse;
  const series = blsResponse.Results?.series;

  if (!Array.isArray(series) || series.length === 0) {
    return [];
  }

  const rawPoints: Array<{ seriesKey: string; observedAt: string; value: number; unit: string }> = [];

  for (const serie of series) {
    if (!Array.isArray(serie.data) || serie.data.length === 0) {
      continue;
    }

    // Get the latest data point (first in the array)
    const latest = serie.data[0];
    if (!latest) continue;

    const value = toNumeric(latest.value);
    if (value === null) continue;

    const yearMonth = formatYearMonth(latest.year, latest.period);
    if (!yearMonth) continue;

    rawPoints.push({
      seriesKey: "macro_cpi.headline",
      observedAt: yearMonth,
      value,
      unit: "index"
    });
  }

  return normalizePoints("bls", rawPoints);
}
