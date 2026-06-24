#!/usr/bin/env tsx
/**
 * Backfill historical EIA refinery utilization observations since a given start date.
 *
 * Usage:
 *   corepack pnpm backfill:eia-refinery --local
 *   corepack pnpm exec tsx scripts/backfill-eia-refinery.ts --from 2026-01-01 --local
 *
 * The script fetches the monthly refinery utilization series used by the live
 * Energy bridge, normalizes it into refinery stress, and writes idempotent
 * rows to both `series_points` and `observations`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRefineryObservations,
  EIA_REFINERY_SERIES_ID,
  type EiaMonthlySeriesResponse
} from "../worker/src/jobs/collectors/eia-refinery";
import { buildBackfillSql as buildSql, executeBackfillSql, fetchPagedResponses, loadEiaApiKey, parseEiaBackfillArgs } from "./eia-backfill-common";

const CLI_CONFIG = {
  scriptName: "eia-refinery",
  defaultFrom: "2026-01-01",
  description: "EIA refinery utilization observations",
  notes: [
    "The script writes normalized refinery stress into both series_points and observations.",
    "It is idempotent for the selected date range and does not delete existing rows."
  ]
} as const;

async function fetchSeriesPage(
  apiBaseUrl: string,
  apiKey: string,
  from: string,
  to: string,
  offset: number,
  length: number
): Promise<EiaMonthlySeriesResponse> {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, "")}/petroleum/pnp/unc/data`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", EIA_REFINERY_SERIES_ID);
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
    throw new Error(`EIA request failed for ${EIA_REFINERY_SERIES_ID} offset ${offset}: HTTP ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as EiaMonthlySeriesResponse;
  if (body.error) {
    throw new Error(`EIA request failed for ${EIA_REFINERY_SERIES_ID} offset ${offset}: ${body.error}`);
  }
  if (body.warning) {
    console.log(`EIA warning for ${EIA_REFINERY_SERIES_ID} offset ${offset}: ${body.warning}`);
  }
  return body;
}

export function buildBackfillSql(observations: ReturnType<typeof buildRefineryObservations>): string {
  return buildSql(observations);
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const options = parseEiaBackfillArgs(process.argv.slice(2), CLI_CONFIG);
  const apiKey = loadEiaApiKey(rootDir, options.remote);

  console.log(`Fetching EIA refinery utilization data from ${options.from} to ${options.to}...`);

  const responses = await fetchPagedResponses(
    (offset, length) => fetchSeriesPage(options.apiBaseUrl, apiKey, options.from, options.to, offset, length),
    options.pageSize
  );
  const observations = responses
    .flatMap((response) => buildRefineryObservations(response.response?.data ?? [], "eia_refinery_monthly_backfill_v1"))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  if (observations.length === 0) {
    console.log("No backfill rows were returned; nothing to write.");
    return;
  }

  const sql = buildBackfillSql(observations);
  executeBackfillSql(rootDir, options, sql, "oil-shock-eia-refinery-backfill-");

  const first = observations[0]?.observedAt;
  const last = observations[observations.length - 1]?.observedAt;
  console.log(
    `Backfilled ${observations.length} EIA refinery utilization observations (${first} to ${last}) into series_points and observations.`
  );
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (isMainModule) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
