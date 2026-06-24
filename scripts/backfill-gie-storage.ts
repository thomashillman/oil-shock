#!/usr/bin/env tsx
/**
 * Backfill AGSI EU gas storage observations since a given start date.
 *
 * Usage:
 *   corepack pnpm backfill:gie-storage --local
 *   corepack pnpm exec tsx scripts/backfill-gie-storage.ts --from 2026-01-01 --local
 *
 * The script fetches the AGSI EU aggregate from the live API, normalizes
 * storage fullness into a 0-1 stress ratio, and writes idempotent rows to
 * both `series_points` and `observations`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  GIE_OBSERVATION_ENGINE_KEY,
  GIE_OBSERVATION_FEED_KEY,
  GIE_SERIES_KEY,
  parseGieStorageResponse,
  type GieStorageResponse
} from "../worker/src/jobs/collectors/gie";
import { resolvePackageManagerLauncher } from "./package-manager";

interface CliOptions {
  from: string;
  to: string;
  local: boolean;
  remote: boolean;
  database: string;
  pageSize: number;
  apiBaseUrl: string;
}

function parseArgs(argv: string[]): CliOptions {
  const today = new Date().toISOString().slice(0, 10);
  const options: CliOptions = {
    from: "2026-01-01",
    to: today,
    local: false,
    remote: false,
    database: "energy_dislocation",
    pageSize: 300,
    apiBaseUrl: "https://agsi.gie.eu/api"
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

  if (!Number.isFinite(options.pageSize) || options.pageSize < 1 || options.pageSize > 300) {
    throw new Error("--page-size must be between 1 and 300");
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
Backfill AGSI EU gas storage observations

Usage:
  corepack pnpm backfill:gie-storage [options]
  corepack pnpm exec tsx scripts/backfill-gie-storage.ts [options]

Options:
  --from <yyyy-mm-dd>    Start date for backfill (default: 2026-01-01)
  --to <yyyy-mm-dd>      End date for backfill (default: today)
  --database <name>      D1 database name (default: energy_dislocation)
  --page-size <n>        AGSI page size, max 300 (default: 300)
  --api-base-url <url>   AGSI API base URL (default: https://agsi.gie.eu/api)
  --local                Run wrangler d1 execute against local D1
  --remote               Run wrangler d1 execute against remote D1
  --help                 Show this help

Environment:
  GIE_API_KEY            Required API key for AGSI
  worker/.dev.vars       Local-development fallback only

  The script writes normalized storage stress into both series_points and observations.
  It is idempotent for the selected date range and does not delete existing rows.
`);
}

function loadApiKey(rootDir: string, remote: boolean): string {
  const envKey = process.env.GIE_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  if (remote) {
    throw new Error("GIE_API_KEY is required for remote backfills.");
  }

  const devVarsPath = path.join(rootDir, "worker", ".dev.vars");
  if (!fs.existsSync(devVarsPath)) {
    throw new Error("GIE_API_KEY is required. Set it in the environment or worker/.dev.vars.");
  }

  const content = fs.readFileSync(devVarsPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    if (key === "GIE_API_KEY") {
      const value = rest.join("=").trim();
      if (value) {
        return value;
      }
    }
  }

  throw new Error("GIE_API_KEY was not found in the environment or worker/.dev.vars.");
}

async function fetchPage(
  apiBaseUrl: string,
  apiKey: string,
  from: string,
  to: string,
  page: number,
  pageSize: number
): Promise<GieStorageResponse> {
  const url = new URL(apiBaseUrl);
  url.searchParams.set("type", "eu");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(pageSize));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "x-key": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`AGSI request failed for page ${page}: HTTP ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as GieStorageResponse;
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

function buildSql(rows: ReturnType<typeof parseGieStorageResponse>): string {
  const statements: string[] = [];

  for (const row of rows) {
    const metadataJson = JSON.stringify(row.metadata);
    statements.push(
      [
        "INSERT INTO series_points (series_key, observed_at, value, unit, source_key)",
        `VALUES (${toSqlLiteral(row.seriesKey)}, ${toSqlLiteral(row.observedAt)}, ${toSqlLiteral(row.value)}, ${toSqlLiteral(row.unit)}, ${toSqlLiteral("gie")})`,
        "ON CONFLICT(series_key, observed_at, source_key) DO UPDATE SET",
        "value = excluded.value,",
        "unit = excluded.unit;"
      ].join(" ")
    );
    statements.push(
      [
        "INSERT INTO observations (engine_key, feed_key, series_key, release_key, as_of_date, observed_at, value, revised_value, latency_tag, source_hash, r2_artifact_key, run_key, unit, metadata_json)",
        `VALUES (${toSqlLiteral(row.engineKey)}, ${toSqlLiteral(row.feedKey)}, ${toSqlLiteral(row.seriesKey)}, ${toSqlLiteral(row.releaseKey)}, ${toSqlLiteral(row.asOfDate)}, ${toSqlLiteral(row.observedAt)}, ${toSqlLiteral(row.value)}, NULL, 'Historical', NULL, NULL, NULL, ${toSqlLiteral(row.unit)}, ${toSqlLiteral(metadataJson)})`,
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

function executeSql(rootDir: string, options: CliOptions, sql: string): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oil-shock-gie-backfill-"));
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

  console.log(`Fetching AGSI EU storage data from ${options.from} to ${options.to}...`);

  const allResponses: GieStorageResponse[] = [];
  let lastPage = 1;

  for (let page = 1; page <= lastPage; page++) {
    const response = await fetchPage(options.apiBaseUrl, apiKey, options.from, options.to, page, options.pageSize);
    allResponses.push(response);
    lastPage = Math.max(lastPage, response.last_page ?? page);
    console.log(`Fetched page ${page}/${lastPage}`);
  }

  const observations = allResponses
    .flatMap((response) => parseGieStorageResponse(response))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  if (observations.length === 0) {
    console.log("No backfill rows were returned; nothing to write.");
    return;
  }

  const sql = buildSql(observations);
  executeSql(rootDir, options, sql);

  const first = observations[0]?.observedAt;
  const last = observations[observations.length - 1]?.observedAt;
  console.log(
    `Backfilled ${observations.length} GIE EU gas storage observations (${first} to ${last}) into series_points and observations.`
  );
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (isMainModule) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
