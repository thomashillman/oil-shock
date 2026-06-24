import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolvePackageManagerLauncher } from "./package-manager";

export interface BackfillObservation {
  engineKey: string;
  feedKey: string;
  seriesKey: string;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
  unit: string;
  metadata: unknown;
}

export interface BackfillExecutionOptions {
  database: string;
  local: boolean;
  remote: boolean;
}

export interface EiaBackfillCliOptions {
  from: string;
  to: string;
  local: boolean;
  remote: boolean;
  database: string;
  pageSize: number;
  apiBaseUrl: string;
}

export interface EiaBackfillCliConfig {
  scriptName: string;
  defaultFrom: string;
  description: string;
  notes: string[];
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

export function loadEiaApiKey(rootDir: string, remote: boolean): string {
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

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseEiaBackfillArgs(argv: string[], config: EiaBackfillCliConfig): EiaBackfillCliOptions {
  const today = new Date().toISOString().slice(0, 10);
  const options: EiaBackfillCliOptions = {
    from: config.defaultFrom,
    to: today,
    local: false,
    remote: false,
    database: "energy_dislocation",
    pageSize: 5000,
    apiBaseUrl: "https://api.eia.gov/v2"
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
      console.log(formatEiaBackfillHelp(config));
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

export function formatEiaBackfillHelp(config: EiaBackfillCliConfig): string {
  return `
Backfill historical ${config.description}

Usage:
  corepack pnpm backfill:${config.scriptName} [options]
  corepack pnpm exec tsx scripts/backfill-${config.scriptName}.ts [options]

Options:
  --from <yyyy-mm-dd>    Start date for backfill (default: ${config.defaultFrom})
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

  ${config.notes.join("\n  ")}
`.trimStart();
}

export async function fetchPagedResponses<TResponse extends { response?: { data?: unknown[]; total?: number } }>(
  fetchPage: (offset: number, length: number) => Promise<TResponse>,
  pageSize: number
): Promise<TResponse[]> {
  const pages: TResponse[] = [];
  let offset = 0;

  while (true) {
    const response = await fetchPage(offset, pageSize);
    const pageRows = response.response?.data ?? [];
    pages.push(response);

    if (pageRows.length === 0 || pageRows.length < pageSize) {
      break;
    }

    const total = response.response?.total;
    offset += pageSize;
    if (typeof total === "number" && offset >= total) {
      break;
    }
  }

  return pages;
}

export function buildBackfillSql(observations: BackfillObservation[]): string {
  const statements: string[] = [];

  for (const observation of observations) {
    const metadataJson = JSON.stringify(observation.metadata);
    statements.push(
      [
        "INSERT INTO series_points (series_key, observed_at, value, unit, source_key)",
        `VALUES (${toSqlLiteral(observation.seriesKey)}, ${toSqlLiteral(observation.observedAt)}, ${toSqlLiteral(observation.value)}, ${toSqlLiteral(observation.unit)}, ${toSqlLiteral("eia")})`,
        "ON CONFLICT(series_key, observed_at, source_key) DO UPDATE SET",
        "value = excluded.value,",
        "unit = excluded.unit;"
      ].join(" ")
    );
    statements.push(
      [
        "INSERT INTO observations (engine_key, feed_key, series_key, release_key, as_of_date, observed_at, value, revised_value, latency_tag, source_hash, r2_artifact_key, run_key, unit, metadata_json)",
        `VALUES (${toSqlLiteral(observation.engineKey)}, ${toSqlLiteral(observation.feedKey)}, ${toSqlLiteral(observation.seriesKey)}, ${toSqlLiteral(observation.releaseKey)}, ${toSqlLiteral(observation.asOfDate)}, ${toSqlLiteral(observation.observedAt)}, ${toSqlLiteral(observation.value)}, NULL, 'Historical', NULL, NULL, NULL, ${toSqlLiteral(observation.unit)}, ${toSqlLiteral(metadataJson)})`,
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

export function executeBackfillSql(
  rootDir: string,
  options: BackfillExecutionOptions,
  sql: string,
  tempDirPrefix: string
): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
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
