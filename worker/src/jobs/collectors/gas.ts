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

interface GieAgsiResponse {
  data?: Array<{
    gasDayStart?: string;
    full?: number | string;
    injection?: number | string;
    withdrawal?: number | string;
    gasInStorage?: number | string;
    workingGasVolume?: number | string;
    status?: string;
  }>;
  last_page?: number;
}

interface GiePagedResponse {
  data?: unknown[];
  last_page?: number;
}

async function fetchEntsoGOperationalData(
  indicators: string[],
  fromDate: string,
  toDate: string
): Promise<Map<string, number[]>> {
  const resultMap = new Map<string, number[]>();

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
      const values = rows
        .map(r => {
          const val = r.value;
          const num = typeof val === "number" ? val : typeof val === "string" ? parseFloat(val) : NaN;
          return isFinite(num) ? num : null;
        })
        .filter((v): v is number => v !== null);

      if (values.length > 0) {
        resultMap.set(indicator, values);
        log("info", `ENTSOG: ${indicator}`, { rowCount: values.length });
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

async function fetchGieAgsi(typeOrCountry: Record<string, string>): Promise<Array<Record<string, unknown>>> {
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
        headers: { "x-key": "6ab6f877a3e9685a5420d66e41cc95ed" },
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

function normalizeValue(value: unknown, max: number = 100): number {
  if (typeof value === "number") {
    return isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isFinite(parsed) ? Math.min(1, Math.max(0, parsed / max)) : 0;
  }
  return 0;
}

export async function collectGas(env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const observedAt = nowIso;
  const points: NormalizedPoint[] = [];

  // ENTSOG: Key indicators for gas flow stress
  const entsoGIndicators = [
    "Nomination",
    "Physical Flow",
    "Firm Available",
    "Firm Technical",
    "Firm Booked"
  ];

  const fromDateStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ?? "2026-03-18";
  const toDateStr = new Date().toISOString().split("T")[0] ?? "2026-04-18";

  const entsoGData = await fetchEntsoGOperationalData(entsoGIndicators, fromDateStr, toDateStr);

  if (entsoGData.size > 0) {
    let flowNomination = 0.5;
    let capacityUtilization = 0.5;

    const physicalFlow = entsoGData.get("Physical Flow");
    const nomination = entsoGData.get("Nomination");
    if (physicalFlow && physicalFlow.length > 0 && nomination && nomination.length > 0) {
      const latestFlow = physicalFlow[0] ?? 0;
      const latestNom = nomination[0] ?? 1;
      flowNomination = Math.min(1, latestFlow / Math.max(1, latestNom));
    }

    const firmBooked = entsoGData.get("Firm Booked");
    const firmTechnical = entsoGData.get("Firm Technical");
    if (firmBooked && firmBooked.length > 0 && firmTechnical && firmTechnical.length > 0) {
      const latestBooked = firmBooked[0] ?? 0;
      const latestTech = firmTechnical[0] ?? 1;
      capacityUtilization = latestBooked / Math.max(1, latestTech);
    }

    points.push({
      seriesKey: "recognition.curve_signal",
      observedAt,
      value: Math.min(1, Math.max(0, 1 - flowNomination)),
      unit: "index",
      sourceKey: "gas"
    });

    points.push({
      seriesKey: "transmission.crack_signal",
      observedAt,
      value: normalizeValue(capacityUtilization),
      unit: "index",
      sourceKey: "gas"
    });

    log("info", `ENTSOG aggregates`, {
      flowNomination: flowNomination.toFixed(3),
      capacityUtilization: capacityUtilization.toFixed(3)
    });
  }

  // GIE AGSI: EU-level storage stress
  try {
    const agsiRows = await fetchGieAgsi({ type: "eu" });

    if (agsiRows.length > 0) {
      const latest = agsiRows[0] as Record<string, unknown>;
      const storageFull = normalizeValue(latest.full, 100);
      const gasInStorage = latest.gasInStorage as number | undefined;
      const workingVolume = latest.workingGasVolume as number | undefined;

      let storageRatio = 0.5;
      if (gasInStorage !== undefined && workingVolume !== undefined && workingVolume > 0) {
        storageRatio = Math.min(1, gasInStorage / workingVolume);
      }

      const injection = latest.injection as number | undefined;
      const withdrawal = latest.withdrawal as number | undefined;
      let netWithdrawal = 0;
      if (injection !== undefined && withdrawal !== undefined) {
        netWithdrawal = normalizeValue(withdrawal - (injection ?? 0), 500);
      }

      points.push({
        seriesKey: "physical.inventory_draw",
        observedAt,
        value: normalizeValue(1 - storageRatio),
        unit: "index",
        sourceKey: "gas"
      });

      points.push({
        seriesKey: "physical.utilization",
        observedAt,
        value: netWithdrawal,
        unit: "index",
        sourceKey: "gas"
      });

      log("info", `GIE AGSI EU`, {
        storageFull: storageFull.toFixed(3),
        storageRatio: storageRatio.toFixed(3),
        netWithdrawal: netWithdrawal.toFixed(3)
      });
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
