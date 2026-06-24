#!/usr/bin/env tsx
/**
 * Backfill historical EIA crude futures curve observations since a given start date.
 *
 * Usage:
 *   corepack pnpm backfill:eia-futures-curve --local
 *   corepack pnpm exec tsx scripts/backfill-eia-futures-curve.ts --from 2024-01-01 --local
 *
 * The script fetches the front and fourth crude oil futures contract series
 * used by the live Energy bridge, normalizes their spread into curve slope,
 * and writes idempotent rows to both `series_points` and `observations`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFuturesCurveObservations,
  EIA_FUTURES_CONTRACT_1,
  EIA_FUTURES_CONTRACT_4,
  type EiaFuturesCurveObservation
} from "../worker/src/jobs/collectors/eia-futures-curve";
import type { EiaSeriesResponse } from "../worker/src/jobs/collectors/eia-inventory";
import { buildBackfillSql as buildSql, executeBackfillSql, fetchPagedResponses, loadEiaApiKey, parseEiaBackfillArgs } from "./eia-backfill-common";

const CLI_CONFIG = {
  scriptName: "eia-futures-curve",
  defaultFrom: "2024-01-01",
  description: "EIA crude futures curve observations",
  notes: [
    "The script writes normalized curve slope into both series_points and observations.",
    "The public EIA data for this series currently ends on 2024-04-05, so later date",
    "ranges may legitimately backfill zero rows."
  ]
} as const;

async function fetchSeriesPage(
  apiBaseUrl: string,
  apiKey: string,
  seriesId: string,
  from: string,
  to: string,
  offset: number,
  length: number
): Promise<EiaSeriesResponse> {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, "")}/petroleum/pri/fut/data`);
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

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`EIA request failed for ${seriesId} offset ${offset}: HTTP ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as EiaSeriesResponse;
  if (body.error) {
    throw new Error(`EIA request failed for ${seriesId} offset ${offset}: ${body.error}`);
  }
  return body;
}

export function buildBackfillSql(observations: EiaFuturesCurveObservation[]): string {
  return buildSql(observations);
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const options = parseEiaBackfillArgs(process.argv.slice(2), CLI_CONFIG);
  const apiKey = loadEiaApiKey(rootDir, options.remote);

  console.log(`Fetching EIA crude futures curve data from ${options.from} to ${options.to}...`);

  const [contract1Pages, contract4Pages] = await Promise.all([
    fetchPagedResponses(
      (offset, length) => fetchSeriesPage(options.apiBaseUrl, apiKey, EIA_FUTURES_CONTRACT_1, options.from, options.to, offset, length),
      options.pageSize
    ),
    fetchPagedResponses(
      (offset, length) => fetchSeriesPage(options.apiBaseUrl, apiKey, EIA_FUTURES_CONTRACT_4, options.from, options.to, offset, length),
      options.pageSize
    )
  ]);

  const observations = buildFuturesCurveObservations(
    contract1Pages.flatMap((response) => response.response?.data ?? []),
    contract4Pages.flatMap((response) => response.response?.data ?? []),
    "eia_futures_curve_daily_backfill_v1"
  ).sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  if (observations.length === 0) {
    console.log("No backfill rows were returned; nothing to write.");
    return;
  }

  const sql = buildBackfillSql(observations);
  executeBackfillSql(rootDir, options, sql, "oil-shock-eia-futures-backfill-");

  const first = observations[0]?.observedAt;
  const last = observations[observations.length - 1]?.observedAt;
  console.log(`Backfilled ${observations.length} EIA futures curve observations (${first} to ${last}) into series_points and observations.`);
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (isMainModule) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
