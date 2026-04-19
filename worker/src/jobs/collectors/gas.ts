import { normalizePoints } from "../../core/normalize";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";
import { fetchJson } from "../../lib/http-client";
import { log } from "../../lib/logging";

const ENTSOG_BASE = "https://transparency.entsog.eu/api/v1";
const AGSI_BASE = "https://agsi.gie.eu/api";

interface EntsoGOperationalDataResponse {
  operationaldatas?: Array<{
    periodFrom?: string;
    periodTo?: string;
    value?: number | string;
    operatorLabel?: string;
    pointLabel?: string;
  }>;
}

interface GiePagedResponse {
  data?: unknown[];
  last_page?: number;
}

async function fetchEntsoGOperationalData(
  indicators: string[],
  fromDate: string,
  toDate: string
): Promise<Map<string, { values: number[]; latestPeriod: string | null }>> {
  const resultMap = new Map<string, { values: number[]; latestPeriod: string | null }>();

  for (const indicator of indicators) {
    try {
      const params = new URLSearchParams({
        indicator,
        from: fromDate,
        to: toDate,
        limit: "1000"
      });

      const url = `${ENTSOG_BASE}/operationaldatas?${params.toString()}`;
      const raw = await fetchJson<EntsoGOperationalDataResponse>(url, {
        timeout: 60000,
        rateLimitDelayMs: 200
      });

      const rows = raw.operationaldatas ?? [];
      const validRows = rows
        .map(r => {
          const val = r.value;
          const num = typeof val === "number" ? val : typeof val === "string" ? parseFloat(val) : NaN;
          return isFinite(num) ? { value: num, period: r.periodFrom ?? null } : null;
        })
        .filter((v): v is { value: number; period: string | null } => v !== null);

      if (validRows.length > 0) {
        resultMap.set(indicator, {
          values: validRows.map(r => r.value),
          latestPeriod: validRows[0]?.period ?? null
        });
        log("info", `ENTSOG: ${indicator}`, { rowCount: validRows.length });
      }
    } catch (error) {
      log("warn", `ENTSOG fetch failed`, {
        indicator,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return resultMap;
}

async function fetchGieAgsi(env: Env, typeOrCountry: Record<string, string>): Promise<Array<Record<string, unknown>>> {
  const allRows: Array<Record<string, unknown>> = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: "300"
      });

      for (const [key, value] of Object.entries(typeOrCountry)) {
        params.set(key, value);
      }

      const url = `${AGSI_BASE}?${params.toString()}`;
      const raw = await fetchJson<GiePagedResponse>(url, {
        headers: { "x-key": env.GIE_API_KEY },
        timeout: 30000,
        rateLimitDelayMs: 150
      });

      lastPage = raw.last_page ?? 1;
      const rows = raw.data ?? [];

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        if (row && typeof row === "object") {
          allRows.push(row as Record<string, unknown>);
        }
      }
      page += 1;
    } catch (error) {
      log("warn", `GIE AGSI fetch failed at page ${page}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      break;
    }
  }

  return allRows;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function collectGas(env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const points: NormalizedPoint[] = [];

  // ENTSOG: Key indicators for EU gas flow stress → physical_stress.eu_pipeline_flow
  const entsoGIndicators = [
    "Nomination",
    "Physical Flow",
    "Firm Available",
    "Firm Technical",
    "Firm Booked"
  ];

  const fromDateStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "";
  const toDateStr = new Date().toISOString().split("T")[0] ?? "";

  const entsoGData = await fetchEntsoGOperationalData(entsoGIndicators, fromDateStr, toDateStr);

  if (entsoGData.size > 0) {
    const physicalFlowEntry = entsoGData.get("Physical Flow");
    const nominationEntry = entsoGData.get("Nomination");

    if (physicalFlowEntry && physicalFlowEntry.values.length > 0 &&
        nominationEntry && nominationEntry.values.length > 0) {
      const latestFlow = physicalFlowEntry.values[0] ?? 0;
      const latestNom = nominationEntry.values[0] ?? 1;
      const flowNomination = Math.min(1, latestFlow / Math.max(1, latestNom));
      // High flow relative to nomination = system under stress = high physical_stress
      const pipelineStress = Math.min(1, Math.max(0, 1 - flowNomination));
      const observedAt = physicalFlowEntry.latestPeriod ?? nowIso;

      points.push({
        seriesKey: "physical_stress.eu_pipeline_flow",
        observedAt,
        value: pipelineStress,
        unit: "index",
        sourceKey: "gas"
      });

      log("info", "ENTSOG pipeline flow stress", {
        flowNomination: flowNomination.toFixed(3),
        pipelineStress: pipelineStress.toFixed(3)
      });
    }
  }

  // GIE AGSI: EU-level storage → physical_stress.eu_gas_storage
  try {
    const agsiRows = await fetchGieAgsi(env, { type: "eu" });

    if (agsiRows.length > 0) {
      const latest = agsiRows[0] as Record<string, unknown>;
      const gasInStorage = toFiniteNumber(latest["gasInStorage"]);
      const workingVolume = toFiniteNumber(latest["workingGasVolume"]);
      const gasDayStart = typeof latest["gasDayStart"] === "string" ? latest["gasDayStart"] : null;
      const observedAt = gasDayStart ?? nowIso;

      if (gasInStorage !== null && workingVolume !== null && workingVolume > 0) {
        const storageRatio = Math.min(1, gasInStorage / workingVolume);
        // Low storage = high physical stress
        const storageStress = Math.min(1, Math.max(0, 1 - storageRatio));

        points.push({
          seriesKey: "physical_stress.eu_gas_storage",
          observedAt,
          value: storageStress,
          unit: "index",
          sourceKey: "gas"
        });

        log("info", "GIE AGSI EU storage stress", {
          storageRatio: storageRatio.toFixed(3),
          storageStress: storageStress.toFixed(3)
        });
      }
    }
  } catch (error) {
    log("warn", `GIE AGSI fetch failed`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return normalizePoints("gas", points.map(p => ({
    seriesKey: p.seriesKey,
    observedAt: p.observedAt,
    value: p.value,
    unit: p.unit
  })));
}
