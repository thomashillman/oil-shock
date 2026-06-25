import { normalizePoints } from "../../core/normalize";
import { loadThresholds } from "../../db/client";
import type { Env } from "../../env";
import type { NormalizedPoint, ScoringThresholds } from "../../types";
import { instrumentedFetch } from "../../lib/api-instrumentation";

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

/**
 * Map a raw USD/bbl spread onto [0,1] using hard empirical anchors instead of a bare divisor.
 * `floor` is the spread we treat as zero stress and `ceiling` is the spread we treat as maximal
 * stress; anything below the floor reads as 0 and anything above the ceiling saturates at 1.
 */
function normalizeWithBounds(value: number, floor: number, ceiling: number): number {
  if (!(ceiling > floor)) {
    return 0;
  }
  return Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));
}

async function fetchLatestSeriesValue(
  env: Env,
  series: string,
  feedName: string
): Promise<{ value: number; observedAt: string } | null> {
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

  const response = await instrumentedFetch<EiaResponse>(
    env,
    url.toString(),
    feedName,
    "EIA",
    {
      timeout: 30000,
      retries: 2,
      backoffMs: 125,
      rateLimitDelayMs: 125
    }
  );
  const row = response.response?.data?.[0];
  if (!row) return null;
  const value = toNumeric(row.value);
  const observedAt = typeof row.period === "string" ? row.period : null;
  if (value === null || observedAt === null) return null;
  return { value, observedAt };
}

export async function collectEnergy(
  env: Env,
  nowIso: string,
  thresholds?: ScoringThresholds
): Promise<NormalizedPoint[]> {
  const [wti, brent, diesel] = await Promise.all([
    fetchLatestSeriesValue(env, "RWTC", "eia_wti"),
    fetchLatestSeriesValue(env, "RBRTE", "eia_brent"),
    fetchLatestSeriesValue(env, "EER_EPD2DXL0_PF4_RGC_DPG", "eia_diesel_wti_crack")
  ]);

  if (!wti || !brent || !diesel) {
    return [];
  }

  const resolvedThresholds = thresholds ?? (await loadThresholds(env));

  // WTI-Brent basis: normalise the spread MAGNITUDE against USD anchors (floor = post-2015
  // average, ceiling = severe logistical bottleneck).
  const spreadMagnitude = Math.abs(brent.value - wti.value);
  let wtiBrentStress = normalizeWithBounds(
    spreadMagnitude,
    resolvedThresholds.wtiBrentFloorUsd,
    resolvedThresholds.wtiBrentCeilingUsd
  );
  // Directional awareness: a WTI premium (WTI > Brent) usually reflects a US domestic pipeline
  // constraint rather than a global crude supply shock, so it carries less hidden-dislocation
  // signal. Discount it; a Brent premium (the global-shock direction) is left at full weight.
  const directionMultiplier = wti.value > brent.value ? resolvedThresholds.wtiPremiumDiscount : 1.0;
  wtiBrentStress = Math.max(0, Math.min(1, wtiBrentStress * directionMultiplier));

  // Diesel-WTI crack: convert diesel ($/gal) to $/bbl, subtract WTI, normalise against refining
  // margin anchors (floor = healthy baseline, ceiling = structural-shortage early warning).
  const dieselCrackUsd = diesel.value * 42 - wti.value;
  const dieselCrackStress = normalizeWithBounds(
    dieselCrackUsd,
    resolvedThresholds.dieselCrackFloorUsd,
    resolvedThresholds.dieselCrackCeilingUsd
  );

  const points: Array<{ seriesKey: string; observedAt: string; value: number; unit: string }> = [
    {
      seriesKey: "energy_spread.wti_brent_spread",
      observedAt: brent.observedAt || wti.observedAt || nowIso,
      value: wtiBrentStress,
      unit: "index"
    },
    {
      seriesKey: "energy_spread.diesel_wti_crack",
      observedAt: diesel.observedAt || wti.observedAt || nowIso,
      value: dieselCrackStress,
      unit: "index"
    }
  ];

  return normalizePoints("energy", points);
}
