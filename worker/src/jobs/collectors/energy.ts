import { normalizePoints } from "../../core/normalize";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";
import { fetchJson } from "../../lib/http-client";

const EIA_BASE = "https://api.eia.gov/v2";

interface EiaResponse {
  response?: {
    data?: Array<Record<string, unknown>>;
  };
}

function rollingWindow(days: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0] ?? "";
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "";
  return { startDate: start, endDate: end };
}

function toNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSpread(absoluteSpread: number, maxSpread = 20): number {
  return Math.max(0, Math.min(1, absoluteSpread / maxSpread));
}

async function fetchLatestSeriesValue(env: Env, series: string): Promise<{ value: number; observedAt: string } | null> {
  const { startDate, endDate } = rollingWindow(45);
  const url = new URL(`${EIA_BASE}/petroleum/pri/spt/data`);
  url.searchParams.set("api_key", env.EIA_API_KEY);
  url.searchParams.set("frequency", "daily");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", series);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", "1");

  const response = await fetchJson<EiaResponse>(url.toString(), {
    timeout: 30000,
    retries: 2,
    backoffMs: 125,
    rateLimitDelayMs: 125
  });
  const row = response.response?.data?.[0];
  if (!row) return null;
  const value = toNumeric(row.value);
  const observedAt = typeof row.period === "string" ? row.period : null;
  if (value === null || observedAt === null) return null;
  return { value, observedAt };
}

export async function collectEnergy(env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const [wti, brent, diesel] = await Promise.all([
    fetchLatestSeriesValue(env, "RWTC"),
    fetchLatestSeriesValue(env, "RBRTE"),
    fetchLatestSeriesValue(env, "EER_EPD2F_PF4_RGC_DPG")
  ]);

  if (!wti || !brent || !diesel) {
    return [];
  }

  const points: Array<{ seriesKey: string; observedAt: string; value: number; unit: string }> = [
    {
      seriesKey: "energy_spread.wti_brent_spread",
      observedAt: brent.observedAt || wti.observedAt || nowIso,
      value: normalizeSpread(Math.abs(brent.value - wti.value), 15),
      unit: "index"
    },
    {
      seriesKey: "energy_spread.diesel_wti_crack",
      observedAt: diesel.observedAt || wti.observedAt || nowIso,
      value: normalizeSpread(diesel.value - wti.value, 40),
      unit: "index"
    }
  ];

  return normalizePoints("energy", points);
}
