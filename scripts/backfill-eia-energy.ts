#!/usr/bin/env tsx
/**
 * Backfill historical EIA-derived energy spread observations since a given start date.
 *
 * Usage:
 *   corepack pnpm backfill:eia-energy --local
 *   corepack pnpm exec tsx scripts/backfill-eia-energy.ts --from 2026-01-01 --local
 *
 * The script fetches the same EIA petroleum spot series used by the live Energy
 * collector, reconstructs the derived spread points historically, and writes
 * idempotent rows to both `series_points` and `observations`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolvePackageManagerLauncher } from "./package-manager";

const EIA_BASE_URL = "https://api.eia.gov/v2";
const EIA_SERIES_IDS = {
  wti: "RWTC",
  brent: "RBRTE",
  diesel: "EER_EPD2DXL0_PF4_RGC_DPG"
} as const;

interface CliOptions {
  from: string;
  to: string;
  local: boolean;
  remote: boolean;
  database: string;
  pageSize: number;
  apiBaseUrl: string;
}

interface EiaSeriesRow {
  period?: string;
  value?: string | number;
}

interface EiaResponse {
  response?: {
    total?: number;
    data?: EiaSeriesRow[];
  };
  warning?: string;
  error?: string;
}

export interface EiaBackfillPoint {
  seriesKey: string;
  observedAt: string;
  value: number;
  unit: "index";
  releaseKey: string;
  metadata: Record<string, unknown>;
}

interface PackageManagerLauncher {
  command: string;
  args: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const today = new Date().toISOString().slice(0, 10);
  const options: CliOptions = {
    from: "2026-01-01",
    to: today,
    local: false,
    remote: false,
    database: "energy_dislocation",
    pageSize: 5000,
    apiBaseUrl: EIA_BASE_URL
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") {
      options.from = requireValue(argv, ++i, "--from");
    } else if (arg === "--to") {
      options.to = requireValue(argv, ++i, "--to");
    } else if (arg === "--database") {
      options.database = requireValue(argv, ++i, "--database");
    } else if (arg === "--page-size") {
      options.pageSize = Number(requireValue(argv, ++i, "--page-size"));
    } else if (arg === "--api-base-url") {
      options.apiBaseUrl = requireValue(argv, ++i, "--api-base-url");
    } else if (arg === "--local") {
      options.local = true;
    } else if (arg === "--remote") {
      options.remote = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.local && options.remote) {
    throw new Error("Use only one of --local or --remote");
  }

  if (!Number.isFinite(options.pageSize) || options.pageSize < 1 || options.pageSize > 5000) {
    throw new Error("--page-size must be between 1 and 5000");
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp(): void {
  console.log(`
Backfill historical EIA-derived energy spread observations

Usage:
  corepack pnpm backfill:eia-energy [options]
  corepack pnpm exec tsx scripts/backfill-eia-energy.ts [options]

Options:
  --from <yyyy-mm-dd>    Start date for backfill (default: 2026-01-01)
  --to <yyyy-mm-dd>      End date for backfill (default: today)
  --database <name>      D1 database name (default: energy_dislocation)
  --page-size <n>        EIA page size, max 5000 (default: 5000)
  --api-base-url <url>   EIA API base URL (default: https://api.eia.gov/v2)
  --local                Run wrangler d1 execute against local D1
  --remote               Run wrangler d1 execute against remote D1
  --help                 Show this help

Environment:
  EIA_API_KEY            Required API key for EIA
  worker/.dev.vars       Local-development fallback only

  The script reconstructs the live Energy bridge's historical spread points
  and writes idempotent rows to both series_points and observations.
`);
}

function loadApiKey(rootDir: string, remote: boolean): string {
  const envKey = process.env.EIA_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  if (remote) {
    throw new Error("EIA_API_KEY is required for remote backfills.");
  }

  const devVarsPath = path.join(rootDir, "worker", ".dev.vars");
  if (!fs.existsSync(devVarsPath)) {
    throw new Error("EIA_API_KEY is required. Set it in the environment or worker/.dev.vars.");
  }

  const content = fs.readFileSync(devVarsPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    if (key === "EIA_API_KEY") {
      const value = rest.join("=").trim();
      if (value) {
        return value;
      }
    }
  }

  throw new Error("EIA_API_KEY was not found in the environment or worker/.dev.vars.");
}

function rollingWindow(from: string, to: string): { startDate: string; endDate: string } {
  return { startDate: from, endDate: to };
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeSpread(absoluteSpread: number, maxSpread: number): number {
  return clamp01(absoluteSpread / maxSpread);
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlLiteral(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${escapeSql(value)}'`;
}

function indexRows(rows: EiaSeriesRow[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    const period = typeof row.period === "string" ? row.period : null;
    const value = toNumeric(row.value);
    if (!period || value === null) {
      continue;
    }
    result.set(period, value);
  }
  return result;
}

export function buildEnergyBackfillPoints(seriesRows: {
  wti: EiaSeriesRow[];
  brent: EiaSeriesRow[];
  diesel: EiaSeriesRow[];
}): EiaBackfillPoint[] {
  const wtiByPeriod = indexRows(seriesRows.wti);
  const brentByPeriod = indexRows(seriesRows.brent);
  const dieselByPeriod = indexRows(seriesRows.diesel);

  const periods = [...wtiByPeriod.keys()]
    .filter((period) => brentByPeriod.has(period) && dieselByPeriod.has(period))
    .sort((left, right) => left.localeCompare(right));

  const points: EiaBackfillPoint[] = [];
  for (const period of periods) {
    const wti = wtiByPeriod.get(period);
    const brent = brentByPeriod.get(period);
    const diesel = dieselByPeriod.get(period);

    if (wti === undefined || brent === undefined || diesel === undefined) {
      continue;
    }

    const sharedMetadata = {
      provider: "EIA",
      sourceKey: "energy",
      bridge: "energy_eia_backfill_v1",
      seriesIds: EIA_SERIES_IDS,
      upstreamPeriod: period,
      upstreamValues: {
        wti,
        brent,
        diesel
      }
    };

    points.push({
      seriesKey: "energy_spread.wti_brent_spread",
      observedAt: period,
      value: normalizeSpread(Math.abs(brent - wti), 15),
      unit: "index",
      releaseKey: `energy:energy_spread.wti_brent_spread:${period}`,
      metadata: {
        ...sharedMetadata,
        formula: "abs(brent - wti) / 15",
        derivedValue: Math.abs(brent - wti)
      }
    });

    points.push({
      seriesKey: "energy_spread.diesel_wti_crack",
      observedAt: period,
      value: normalizeSpread(diesel * 42 - wti, 40),
      unit: "index",
      releaseKey: `energy:energy_spread.diesel_wti_crack:${period}`,
      metadata: {
        ...sharedMetadata,
        formula: "(diesel * 42 - wti) / 40",
        derivedValue: diesel * 42 - wti
      }
    });
  }

  return points;
}

export function buildBackfillSql(points: EiaBackfillPoint[]): string {
  const statements: string[] = [];

  for (const point of points) {
    const metadataJson = JSON.stringify(point.metadata);
    statements.push(
      [
        "INSERT INTO series_points (series_key, observed_at, value, unit, source_key)",
        `VALUES (${toSqlLiteral(point.seriesKey)}, ${toSqlLiteral(point.observedAt)}, ${toSqlLiteral(point.value)}, ${toSqlLiteral(point.unit)}, ${toSqlLiteral("energy")})`,
        "ON CONFLICT(series_key, observed_at, source_key) DO UPDATE SET",
        "value = excluded.value,",
        "unit = excluded.unit;"
      ].join(" ")
    );
    statements.push(
      [
        "INSERT INTO observations (engine_key, feed_key, series_key, release_key, as_of_date, observed_at, value, revised_value, latency_tag, source_hash, r2_artifact_key, run_key, unit, metadata_json)",
        `VALUES (${toSqlLiteral("energy")}, ${toSqlLiteral(point.seriesKey)}, ${toSqlLiteral(point.seriesKey)}, ${toSqlLiteral(point.releaseKey)}, ${toSqlLiteral(point.observedAt)}, ${toSqlLiteral(point.observedAt)}, ${toSqlLiteral(point.value)}, NULL, 'Historical', NULL, NULL, NULL, ${toSqlLiteral(point.unit)}, ${toSqlLiteral(metadataJson)})`,
        "ON CONFLICT (engine_key, feed_key, series_key, release_key, as_of_date)",
        "DO UPDATE SET",
        "observed_at = excluded.observed_at,",
        "value = excluded.value,",
        "revised_value = excluded.revised_value,",
        "latency_tag = excluded.latency_tag,",
        "source_hash = excluded.source_hash,",
        "r2_artifact_key = excluded.r2_artifact_key,",
        "run_key = excluded.run_key,",
        "unit = excluded.unit,",
        "metadata_json = excluded.metadata_json,",
        "updated_at = CURRENT_TIMESTAMP;"
      ].join(" ")
    );
  }

  return statements.join("\n");
}

async function fetchSeriesPage(
  apiBaseUrl: string,
  apiKey: string,
  seriesId: string,
  from: string,
  to: string,
  offset: number,
  length: number
): Promise<EiaResponse> {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, "")}/petroleum/pri/spt/data`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", "daily");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", seriesId);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "asc");
  url.searchParams.set("start", from);
  url.searchParams.set("end", to);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(length));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`EIA request failed for ${seriesId} offset ${offset}: HTTP ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as EiaResponse;
  if (body.error) {
    throw new Error(`EIA request failed for ${seriesId} offset ${offset}: ${body.error}`);
  }
  if (body.warning) {
    console.log(`EIA warning for ${seriesId} offset ${offset}: ${body.warning}`);
  }
  return body;
}

async function fetchSeriesHistory(
  apiBaseUrl: string,
  apiKey: string,
  seriesId: string,
  from: string,
  to: string,
  pageSize: number
): Promise<EiaSeriesRow[]> {
  const rows: EiaSeriesRow[] = [];
  let offset = 0;

  while (true) {
    const response = await fetchSeriesPage(apiBaseUrl, apiKey, seriesId, from, to, offset, pageSize);
    const pageRows = response.response?.data ?? [];
    if (pageRows.length === 0) {
      break;
    }

    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      break;
    }

    const total = response.response?.total;
    offset += pageSize;
    if (typeof total === "number" && rows.length >= total) {
      break;
    }
  }

  return rows;
}

function executeSql(rootDir: string, options: CliOptions, sql: string): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oil-shock-eia-backfill-"));
  const sqlPath = path.join(tempDir, "backfill.sql");
  fs.writeFileSync(sqlPath, sql, "utf8");

  const launcher = resolvePackageManagerLauncher();
  const args = ["exec", "wrangler", "d1", "execute", options.database];

  if (options.local) {
    args.push("--local");
  } else if (options.remote) {
    args.push("--remote");
  }

  args.push("--file", sqlPath, "--config", path.join(rootDir, "wrangler.jsonc"));

  try {
    const output = execFileSync(launcher.command, [...launcher.args, ...args], {
      cwd: path.join(rootDir, "worker"),
      encoding: "utf8"
    });
    process.stdout.write(output);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const options = parseArgs(process.argv.slice(2));
  const apiKey = loadApiKey(rootDir, options.remote);

  console.log(`Fetching EIA energy data from ${options.from} to ${options.to}...`);

  const { startDate, endDate } = rollingWindow(options.from, options.to);
  const [wtiRows, brentRows, dieselRows] = await Promise.all([
    fetchSeriesHistory(options.apiBaseUrl, apiKey, EIA_SERIES_IDS.wti, startDate, endDate, options.pageSize),
    fetchSeriesHistory(options.apiBaseUrl, apiKey, EIA_SERIES_IDS.brent, startDate, endDate, options.pageSize),
    fetchSeriesHistory(options.apiBaseUrl, apiKey, EIA_SERIES_IDS.diesel, startDate, endDate, options.pageSize)
  ]);

  console.log(
    `Fetched ${wtiRows.length} WTI rows, ${brentRows.length} Brent rows, and ${dieselRows.length} Diesel rows.`
  );

  const points = buildEnergyBackfillPoints({ wti: wtiRows, brent: brentRows, diesel: dieselRows });
  if (points.length === 0) {
    console.log("No backfill rows were returned; nothing to write.");
    return;
  }

  const sql = buildBackfillSql(points);
  executeSql(rootDir, options, sql);

  const first = points[0]?.observedAt;
  const last = points[points.length - 1]?.observedAt;
  console.log(
    `Backfilled ${points.length} EIA-derived energy observations (${first} to ${last}) into series_points and observations.`
  );
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (isMainModule) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
