import { normalizePoints } from "../../core/normalize";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";
import { fetchJson } from "../../lib/http-client";
import { log } from "../../lib/logging";

const EIA_BASE = "https://api.eia.gov/v2";

interface RouteSpec {
  label: string;
  route: string;
  dataCols: string[];
  facets: Record<string, string[]>;
  frequency?: string;
  windowDays: number; // rolling window in days; use 0 for weekly
  windowWeeks?: number; // for weekly series
  seriesKeyMap: Record<string, string>;
  normalizer: (value: number, history?: number[]) => number;
}

function rollingWindow(days: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0] ?? "";
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "";
  return { startDate: start, endDate: end };
}

function rollingWindowWeeks(weeks: number): { startDate: string; endDate: string } {
  return rollingWindow(weeks * 7);
}

// WTI spot: normalize against rolling 180-day p95 via history bucket
function normalizeWtiSpot(value: number, history: number[] = []): number {
  const allValues = [...history, value].filter(isFinite);
  if (allValues.length < 2) {
    // Fallback: use $120 as rough maximum when no history
    return Math.max(0, Math.min(1, value / 120));
  }
  const sorted = [...allValues].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index] ?? sorted[sorted.length - 1] ?? 120;
  return Math.max(0, Math.min(1, value / Math.max(1, p95)));
}

// Futures curve slope: (front_month - month_12) / front_month → backwardation = high, contango = low
// Input: expects rows sorted desc by period; first row is front, last available is far month
function normalizeCurveSlope(front: number, far: number): number {
  if (front === 0) return 0.5;
  const slope = (front - far) / Math.abs(front);
  // Rescale: slope in [-0.15, +0.15] → [0, 1]; slope > 0 = backwardation = high price_signal
  const rescaled = (slope + 0.15) / 0.3;
  return Math.max(0, Math.min(1, rescaled));
}

// Inventory draw: (5yr_avg - latest) / 5yr_avg — shortage of stocks = high physical_stress
function normalizeInventoryDraw(latest: number, avg5yr: number): number {
  if (avg5yr === 0) return 0;
  const draw = (avg5yr - latest) / avg5yr;
  return Math.max(0, Math.min(1, draw));
}

// Refinery utilization: already a percentage, divide by 100
function normalizeRefinery(value: number): number {
  return Math.max(0, Math.min(1, value / 100));
}

// Crack spread: normalize against rolling baseline (z-score approach, clamped to [0,1])
function normalizeCrackSpread(value: number, history: number[] = []): number {
  const allValues = [...history, value].filter(isFinite);
  if (allValues.length < 2) {
    // Fallback: assume $10 crack ≈ 0.5, $25 ≈ 1.0
    return Math.max(0, Math.min(1, value / 25));
  }
  const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const variance = allValues.reduce((a, b) => a + (b - mean) ** 2, 0) / allValues.length;
  const std = Math.sqrt(variance) || 1;
  const z = (value - mean) / std;
  // z-score in [-3, +3] → [0, 1]
  return Math.max(0, Math.min(1, (z + 3) / 6));
}

interface EIADataResponse {
  response?: {
    data?: Array<Record<string, unknown>>;
    total?: number | string;
  };
}

async function buildQueryParams(
  dataCols: string[],
  facets: Record<string, string[]>,
  frequency: string | undefined,
  startDate: string,
  endDate: string,
  offset: number,
  length: number
): Promise<Record<string, string | string[] | number>> {
  const params: Record<string, string | string[] | number> = {
    offset,
    length
  };

  params["data[]"] = dataCols;

  if (frequency) {
    params.frequency = frequency;
  }

  params.start = startDate;
  params.end = endDate;

  params["sort[0][column]"] = "period";
  params["sort[0][direction]"] = "desc";

  for (const [facetName, values] of Object.entries(facets)) {
    params[`facets[${facetName}][]`] = values;
  }

  return params;
}

async function fetchEiaRouteData(
  env: Env,
  route: string,
  dataCols: string[],
  facets: Record<string, string[]>,
  frequency: string | undefined,
  startDate: string,
  endDate: string,
  maxRows: number = 5000
): Promise<Array<Record<string, unknown>>> {
  const allRows: Array<Record<string, unknown>> = [];
  let offset = 0;
  const pageSize = Math.min(maxRows, 5000);

  while (true) {
    const params = await buildQueryParams(
      dataCols,
      facets,
      frequency,
      startDate,
      endDate,
      offset,
      pageSize
    );

    const url = new URL(`${EIA_BASE}/${route}/data`);
    url.searchParams.set("api_key", env.EIA_API_KEY);

    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, String(v)));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    try {
      const raw = await fetchJson<EIADataResponse>(url.toString(), {
        timeout: 45000,
        rateLimitDelayMs: 150
      });

      const response = raw.response;
      if (!response) {
        break;
      }

      const rows = response.data ?? [];
      const total = typeof response.total === "string" ? parseInt(response.total, 10) : response.total ?? 0;

      if (rows.length === 0) {
        break;
      }

      allRows.push(...rows);

      offset += rows.length;
      if (offset >= total || rows.length < pageSize) {
        break;
      }
    } catch (error) {
      log("error", `Failed to fetch EIA route data`, {
        route,
        offset,
        error: error instanceof Error ? error.message : String(error)
      });
      break;
    }
  }

  return allRows;
}

function normalizeEiaValue(value: unknown): number | null {
  if (typeof value === "number") {
    return isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractPeriod(row: Record<string, unknown>, nowIso: string): string {
  const period = row["period"];
  if (typeof period === "string" && period.length >= 7) {
    // EIA returns YYYY-MM-DD or YYYY-MM
    const parsed = Date.parse(period);
    if (!isNaN(parsed)) return period;
  }
  log("warn", "EIA row missing valid period field, falling back to nowIso", { period });
  return nowIso;
}

export async function collectEia(env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const points: NormalizedPoint[] = [];

  // --- price_signal.spot_wti: WTI daily spot price (RWTC) ---
  try {
    const { startDate, endDate } = rollingWindow(180);
    const wtiRows = await fetchEiaRouteData(
      env,
      "petroleum/pri/spt",
      ["value"],
      { series: ["RWTC"] },
      "daily",
      startDate,
      endDate
    );

    if (wtiRows.length > 0) {
      const history = wtiRows.slice(1).map(r => normalizeEiaValue(r["value"])).filter((v): v is number => v !== null);
      const latestRow = wtiRows[0];
      const rawValue = latestRow ? normalizeEiaValue(latestRow["value"]) : null;
      if (rawValue !== null && latestRow) {
        points.push({
          seriesKey: "price_signal.spot_wti",
          observedAt: extractPeriod(latestRow, nowIso),
          value: normalizeWtiSpot(rawValue, history),
          unit: "index",
          sourceKey: "eia"
        });
      }
    } else {
      log("warn", "EIA: WTI spot returned no data");
    }
  } catch (error) {
    log("error", "EIA collector failed for WTI spot", { error: error instanceof Error ? error.message : String(error) });
  }

  // --- price_signal.curve_slope: WTI futures curve backwardation/contango ---
  try {
    const { startDate, endDate } = rollingWindow(60);
    const futRows = await fetchEiaRouteData(
      env,
      "petroleum/pri/fut",
      ["value"],
      { series: ["RCLC1", "RCLC12"] },
      "daily",
      startDate,
      endDate,
      100
    );

    if (futRows.length >= 2) {
      // Sort by period desc; first two rows per series
      const byPeriod = [...futRows].sort((a, b) => String(b["period"]).localeCompare(String(a["period"])));
      const front = normalizeEiaValue(byPeriod[0]?.["value"]);
      const far = normalizeEiaValue(byPeriod[byPeriod.length - 1]?.["value"]);
      const latestRow = byPeriod[0];
      if (front !== null && far !== null && latestRow) {
        points.push({
          seriesKey: "price_signal.curve_slope",
          observedAt: extractPeriod(latestRow, nowIso),
          value: normalizeCurveSlope(front, far),
          unit: "index",
          sourceKey: "eia"
        });
      }
    } else {
      log("warn", "EIA: futures curve returned insufficient data", { rows: futRows.length });
    }
  } catch (error) {
    log("error", "EIA collector failed for futures curve", { error: error instanceof Error ? error.message : String(error) });
  }

  // --- physical_stress.inventory_draw: Weekly crude stocks (WCESTUS1) ---
  try {
    const { startDate, endDate } = rollingWindowWeeks(26);
    const stockRows = await fetchEiaRouteData(
      env,
      "petroleum/stoc/wstk",
      ["value"],
      { series: ["WCESTUS1"] },
      "weekly",
      startDate,
      endDate
    );

    if (stockRows.length > 0) {
      const values = stockRows.map(r => normalizeEiaValue(r["value"])).filter((v): v is number => v !== null);
      const latest = values[0];
      const latestRow = stockRows[0];
      if (latest !== undefined && latestRow) {
        const avg5yr = values.reduce((a, b) => a + b, 0) / values.length;
        points.push({
          seriesKey: "physical_stress.inventory_draw",
          observedAt: extractPeriod(latestRow, nowIso),
          value: normalizeInventoryDraw(latest, avg5yr),
          unit: "index",
          sourceKey: "eia"
        });
      }
    } else {
      log("warn", "EIA: crude stocks returned no data");
    }
  } catch (error) {
    log("error", "EIA collector failed for crude stocks", { error: error instanceof Error ? error.message : String(error) });
  }

  // --- physical_stress.refinery_utilization: Refinery operable utilization (monthly) ---
  try {
    const { startDate, endDate } = rollingWindow(180);
    const refineryRows = await fetchEiaRouteData(
      env,
      "petroleum/pnp/unc",
      ["value"],
      {},
      "monthly",
      startDate,
      endDate,
      24
    );

    if (refineryRows.length > 0) {
      const latestRow = refineryRows[0];
      const rawValue = latestRow ? normalizeEiaValue(latestRow["value"]) : null;
      if (rawValue !== null && latestRow) {
        points.push({
          seriesKey: "physical_stress.refinery_utilization",
          observedAt: extractPeriod(latestRow, nowIso),
          value: normalizeRefinery(rawValue),
          unit: "index",
          sourceKey: "eia"
        });
      }
    } else {
      log("warn", "EIA: refinery utilization returned no data");
    }
  } catch (error) {
    log("error", "EIA collector failed for refinery utilization", { error: error instanceof Error ? error.message : String(error) });
  }

  // --- market_response.crack_spread: 3:2:1 crack spread from spot prices ---
  try {
    const { startDate, endDate } = rollingWindow(180);
    const gasRows = await fetchEiaRouteData(
      env,
      "petroleum/pri/spt",
      ["value"],
      { series: ["EER_EPMRR_PF4_RGC_DPG"] }, // RBOB gasoline
      "daily",
      startDate,
      endDate
    );
    const distRows = await fetchEiaRouteData(
      env,
      "petroleum/pri/spt",
      ["value"],
      { series: ["EER_EPD2F_PF4_RGC_DPG"] }, // No.2 heating oil
      "daily",
      startDate,
      endDate
    );
    const crudeRows = await fetchEiaRouteData(
      env,
      "petroleum/pri/spt",
      ["value"],
      { series: ["RWTC"] },
      "daily",
      startDate,
      endDate
    );

    if (gasRows.length > 0 && distRows.length > 0 && crudeRows.length > 0) {
      const latestGas = normalizeEiaValue(gasRows[0]?.["value"]);
      const latestDist = normalizeEiaValue(distRows[0]?.["value"]);
      const latestCrude = normalizeEiaValue(crudeRows[0]?.["value"]);

      if (latestGas !== null && latestDist !== null && latestCrude !== null && latestCrude > 0) {
        // 3:2:1 crack in $/bbl: (2 * gas + 1 * dist - 3 * crude) / crude
        // Gas/dist prices are in $/gal; crude in $/bbl. Convert: 1 bbl = 42 gal
        const crack321 = (2 * latestGas * 42 + latestDist * 42 - 3 * latestCrude) / latestCrude;
        const history = crudeRows.slice(1).map(r => {
          const g = normalizeEiaValue(gasRows.find(gr => gr["period"] === r["period"])?.["value"]);
          const d = normalizeEiaValue(distRows.find(dr => dr["period"] === r["period"])?.["value"]);
          const c = normalizeEiaValue(r["value"]);
          if (g !== null && d !== null && c !== null && c > 0) {
            return (2 * g * 42 + d * 42 - 3 * c) / c;
          }
          return null;
        }).filter((v): v is number => v !== null);

        const latestRow = crudeRows[0];
        if (latestRow) {
          points.push({
            seriesKey: "market_response.crack_spread",
            observedAt: extractPeriod(latestRow, nowIso),
            value: normalizeCrackSpread(crack321, history),
            unit: "index",
            sourceKey: "eia"
          });
        }
      }
    } else {
      log("warn", "EIA: crack spread data incomplete", {
        gasRows: gasRows.length,
        distRows: distRows.length,
        crudeRows: crudeRows.length
      });
    }
  } catch (error) {
    log("error", "EIA collector failed for crack spread", { error: error instanceof Error ? error.message : String(error) });
  }

  log("info", "EIA collector completed", { pointsCollected: points.length });

  return normalizePoints("eia", points.map(p => ({
    seriesKey: p.seriesKey,
    observedAt: p.observedAt,
    value: p.value,
    unit: p.unit
  })));
}
