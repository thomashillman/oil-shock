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
  startDate: string;
  endDate: string;
  seriesKeyMap: Record<string, string>;
}

const ROUTE_SPECS: RouteSpec[] = [
  {
    label: "Brent spot price",
    route: "petroleum/pri/spt",
    dataCols: ["value"],
    facets: { series: ["RBRTE"] },
    frequency: "daily",
    startDate: "2026-02-01",
    endDate: "2026-04-18",
    seriesKeyMap: { value: "physical.inventory_draw" }
  },
  {
    label: "WTI spot price",
    route: "petroleum/pri/spt",
    dataCols: ["value"],
    facets: { series: ["RWTC"] },
    frequency: "daily",
    startDate: "2026-02-01",
    endDate: "2026-04-18",
    seriesKeyMap: { value: "physical.utilization" }
  },
  {
    label: "Natural gas storage",
    route: "natural-gas/stor/cap",
    dataCols: ["value"],
    facets: {},
    frequency: "weekly",
    startDate: "2026-01-01",
    endDate: "2026-04-18",
    seriesKeyMap: { value: "recognition.curve_signal" }
  },
  {
    label: "Natural gas price",
    route: "natural-gas/pri",
    dataCols: ["value"],
    facets: {},
    frequency: "daily",
    startDate: "2026-02-01",
    endDate: "2026-04-18",
    seriesKeyMap: { value: "transmission.crack_signal" }
  }
];

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

export async function collectEia(_env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const observedAt = nowIso;
  const points: NormalizedPoint[] = [];

  for (const spec of ROUTE_SPECS) {
    try {
      const rows = await fetchEiaRouteData(
        _env,
        spec.route,
        spec.dataCols,
        spec.facets,
        spec.frequency,
        spec.startDate,
        spec.endDate
      );

      if (rows.length === 0) {
        log("warn", `EIA route returned no data`, { label: spec.label, route: spec.route });
        continue;
      }

      const lastTwo = rows.slice(0, 2);

      for (const row of lastTwo) {
        for (const [dataCol, seriesKey] of Object.entries(spec.seriesKeyMap)) {
          const rawValue = row[dataCol];
          const normalizedValue = normalizeEiaValue(rawValue);

          if (normalizedValue !== null) {
            points.push({
              seriesKey,
              observedAt,
              value: Math.min(1, Math.max(0, normalizedValue / 120)),
              unit: "index",
              sourceKey: "eia"
            });
          }
        }
      }

      log("info", `EIA collector: ${spec.label}`, { route: spec.route, rowsReceived: rows.length });
    } catch (error) {
      log("error", `EIA collector failed for route`, {
        label: spec.label,
        route: spec.route,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return normalizePoints("eia", points.map(p => ({
    seriesKey: p.seriesKey,
    observedAt: p.observedAt,
    value: p.value,
    unit: p.unit
  })));
}
