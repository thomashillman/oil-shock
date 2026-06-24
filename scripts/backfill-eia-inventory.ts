#!/usr/bin/env tsx
/**
 * Backfill historical EIA crude inventory observations since a given start date.
 *
 * Usage:
 *   corepack pnpm backfill:eia-inventory --local
 *   corepack pnpm exec tsx scripts/backfill-eia-inventory.ts --from 2026-01-01 --local
 *
 * The script fetches the weekly crude oil stocks series used by the live
 * Energy bridge, normalizes it into inventory stress, and writes idempotent
 * rows to both `series_points` and `observations`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildInventoryObservations,
  EIA_INVENTORY_SERIES_ID,
  type EiaSeriesResponse
} from "../worker/src/jobs/collectors/eia-inventory";
import { buildBackfillSql as buildSql, executeBackfillSql, fetchPagedResponses, loadEiaApiKey, parseEiaBackfillArgs } from "./eia-backfill-common";

const CLI_CONFIG = {
  scriptName: "eia-inventory",
  defaultFrom: "2026-01-01",
  description: "EIA crude inventory observations",
  notes: [
    "The script writes normalized inventory stress into both series_points and observations.",
    "It is idempotent for the selected date range and does not delete existing rows."
  ]
} as const;

function shiftDate(date: string, days: number): string {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date: ${date}`);
  }

  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fetchSeriesPage(
  apiBaseUrl: string,
  apiKey: string,
  from: string,
  to: string,
  offset: number,
  length: number
): Promise<EiaSeriesResponse> {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, "")}/petroleum/stoc/wstk/data`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", EIA_INVENTORY_SERIES_ID);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "asc");
  url.searchParams.set("start", from);
  url.searchParams.set("end", to);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(length));

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`EIA request failed for ${EIA_INVENTORY_SERIES_ID} offset ${offset}: HTTP ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as EiaSeriesResponse;
  if (body.error) {
    throw new Error(`EIA request failed for ${EIA_INVENTORY_SERIES_ID} offset ${offset}: ${body.error}`);
  }
  return body;
}

export function buildBackfillSql(observations: ReturnType<typeof buildInventoryObservations>): string {
  return buildSql(observations);
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const options = parseEiaBackfillArgs(process.argv.slice(2), CLI_CONFIG);
  const apiKey = loadEiaApiKey(rootDir, options.remote);

  const fetchFrom = shiftDate(options.from, -400);
  console.log(`Fetching EIA crude inventory data from ${fetchFrom} to ${options.to}...`);

  const responses = await fetchPagedResponses(
    (offset, length) => fetchSeriesPage(options.apiBaseUrl, apiKey, fetchFrom, options.to, offset, length),
    options.pageSize
  );
  const observations = responses
    .flatMap((response) => buildInventoryObservations(response.response?.data ?? [], "eia_inventory_weekly_backfill_v1"))
    .filter((observation) => observation.observedAt >= options.from && observation.observedAt <= options.to)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  if (observations.length === 0) {
    console.log("No backfill rows were returned; nothing to write.");
    return;
  }

  const sql = buildBackfillSql(observations);
  executeBackfillSql(rootDir, options, sql, "oil-shock-eia-inventory-backfill-");

  const first = observations[0]?.observedAt;
  const last = observations[observations.length - 1]?.observedAt;
  console.log(`Backfilled ${observations.length} EIA crude inventory observations (${first} to ${last}) into series_points and observations.`);
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isMainModule) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
