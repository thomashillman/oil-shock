import { normalizePoints } from "../../core/normalize";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";
import { log } from "../../lib/logging";

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

// Disabled-by-default collector for Phase 6B CPI data.
// Not yet wired into runCollection. Phase 6B integration deferred until:
// - Phase 6A (Energy) is stable for 4+ weeks
// - 8-12 weeks of CPI data has been accumulated
// See: docs/phase-6b-macro-releases.md
export async function collectMacroReleases(env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  log("info", "Macro Releases collector invoked (not yet enabled in scheduled collection)");
  // Placeholder: would fetch from BLS API and parse CPI data
  // Currently returns empty to maintain readiness without affecting production
  return [];
}
