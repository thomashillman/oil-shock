#!/usr/bin/env node
/**
 * Phase 6A preview endpoint reliability probe.
 *
 * Probes required Phase 6A endpoints repeatedly and produces structured JSON evidence.
 * Captures HTTP status, cf-ray, colo, JSON parse success, and DNS cache overflow counts.
 *
 * Diagnostic only. Does not change rollout state, call gate-sign-off, or mutate secrets.
 *
 * Usage:
 *   ADMIN_TOKEN=<token> node scripts/phase6a/probe-preview-endpoints.mjs \
 *     --base-url https://energy-dislocation-engine-preview-preview.tj-hillman.workers.dev \
 *     --attempts 30 \
 *     --delay-ms 1000 \
 *     --out docs/evidence/phase6a-preview-endpoint-probe.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_BASE_URL =
  "https://energy-dislocation-engine-preview-preview.tj-hillman.workers.dev";
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_OUT = "docs/evidence/phase6a-preview-endpoint-probe.json";

const REQUIRED_ENDPOINTS = [
  "/health",
  "/api/admin/rollout-readiness",
  "/api/admin/rollout-status",
  "/api/admin/api-health",
];

const ADMIN_ENDPOINTS = new Set([
  "/api/admin/rollout-readiness",
  "/api/admin/rollout-status",
  "/api/admin/api-health",
]);

/**
 * Parses the colo suffix from a cf-ray header value.
 * Format: "<hex>-<COLO>" e.g. "87b8c4d8bc6d7f6c-IAD" → "IAD"
 * Returns null for malformed or missing values.
 *
 * @param {string | null | undefined} cfRay
 * @returns {string | null}
 */
export function parseCfRayColo(cfRay) {
  if (!cfRay || typeof cfRay !== "string") return null;
  const parts = cfRay.split("-");
  if (parts.length < 2) return null;
  const colo = parts[parts.length - 1].trim();
  if (!colo || !/^[A-Z]{2,5}$/.test(colo)) return null;
  return colo;
}

/**
 * Classifies a probe response.
 *
 * @param {{ status: number, contentType: string | null, body: string }} result
 * @returns {{ isSuccess: boolean, isDnsCacheOverflow: boolean, jsonParseSucceeded: boolean }}
 */
export function classifyResult({ status, contentType, body }) {
  const isJsonContentType =
    typeof contentType === "string" && contentType.includes("application/json");

  let jsonParseSucceeded = false;
  if (body) {
    try {
      JSON.parse(body);
      jsonParseSucceeded = true;
    } catch {
      jsonParseSucceeded = false;
    }
  }

  const isDnsCacheOverflow =
    status !== 200 &&
    typeof body === "string" &&
    body.toLowerCase().includes("dns cache overflow");

  const isSuccess = status === 200 && jsonParseSucceeded;

  return { isSuccess, isDnsCacheOverflow, jsonParseSucceeded };
}

/**
 * Summarises an array of per-attempt probe results.
 *
 * @param {Array<{
 *   endpoint: string,
 *   attempt: number,
 *   http_status: number,
 *   content_type: string | null,
 *   json_parse_succeeded: boolean,
 *   body_excerpt: string | null,
 *   cf_ray: string | null,
 *   colo: string | null,
 *   duration_ms: number,
 *   is_success: boolean,
 *   is_dns_cache_overflow: boolean,
 * }>} results
 * @returns {{
 *   total_attempts_per_endpoint: number,
 *   failures_by_endpoint: Record<string, number>,
 *   failures_by_status: Record<string, number>,
 *   failures_by_colo: Record<string, number>,
 *   dns_cache_overflow_count: number,
 *   all_required_endpoints_passed: boolean,
 * }}
 */
export function summarizeResults(results) {
  const totalAttemptsPerEndpoint =
    results.length > 0
      ? Math.max(...REQUIRED_ENDPOINTS.map((ep) => results.filter((r) => r.endpoint === ep).length))
      : 0;

  const failures = results.filter((r) => !r.is_success);

  const failuresByEndpoint = {};
  const failuresByStatus = {};
  const failuresByColo = {};

  for (const ep of REQUIRED_ENDPOINTS) {
    failuresByEndpoint[ep] = 0;
  }

  for (const r of failures) {
    failuresByEndpoint[r.endpoint] = (failuresByEndpoint[r.endpoint] ?? 0) + 1;

    const statusKey = String(r.http_status);
    failuresByStatus[statusKey] = (failuresByStatus[statusKey] ?? 0) + 1;

    if (r.colo) {
      failuresByColo[r.colo] = (failuresByColo[r.colo] ?? 0) + 1;
    } else {
      failuresByColo["unknown"] = (failuresByColo["unknown"] ?? 0) + 1;
    }
  }

  const dnsCacheOverflowCount = results.filter((r) => r.is_dns_cache_overflow).length;

  const allRequiredEndpointsPassed =
    results.length > 0 && failures.length === 0;

  return {
    total_attempts_per_endpoint: totalAttemptsPerEndpoint,
    failures_by_endpoint: failuresByEndpoint,
    failures_by_status: failuresByStatus,
    failures_by_colo: failuresByColo,
    dns_cache_overflow_count: dnsCacheOverflowCount,
    all_required_endpoints_passed: allRequiredEndpointsPassed,
  };
}

/**
 * Parses CLI arguments.
 *
 * @param {string[]} argv
 * @returns {{ baseUrl: string, attempts: number, delayMs: number, out: string }}
 */
function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    attempts: DEFAULT_ATTEMPTS,
    delayMs: DEFAULT_DELAY_MS,
    out: DEFAULT_OUT,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url" && i + 1 < argv.length) {
      options.baseUrl = argv[++i];
    } else if (argv[i] === "--attempts" && i + 1 < argv.length) {
      const parsed = parseInt(argv[++i], 10);
      if (!isNaN(parsed) && parsed > 0) options.attempts = parsed;
    } else if (argv[i] === "--delay-ms" && i + 1 < argv.length) {
      const parsed = parseInt(argv[++i], 10);
      if (!isNaN(parsed) && parsed >= 0) options.delayMs = parsed;
    } else if (argv[i] === "--out" && i + 1 < argv.length) {
      options.out = argv[++i];
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Phase 6A Preview Endpoint Reliability Probe

Usage: node scripts/phase6a/probe-preview-endpoints.mjs [options]

Options:
  --base-url <url>    Base URL of preview Worker (default: ${DEFAULT_BASE_URL})
  --attempts <n>      Number of probe attempts per endpoint (default: ${DEFAULT_ATTEMPTS})
  --delay-ms <n>      Delay between rounds in milliseconds (default: ${DEFAULT_DELAY_MS})
  --out <path>        Output JSON path (default: ${DEFAULT_OUT})
  --help              Show this help

Environment Variables:
  ADMIN_TOKEN         Bearer token for admin endpoints (never logged)

Probed endpoints:
  GET /health                        (unauthenticated)
  GET /api/admin/rollout-readiness   (requires ADMIN_TOKEN)
  GET /api/admin/rollout-status      (requires ADMIN_TOKEN)
  GET /api/admin/api-health          (requires ADMIN_TOKEN)

This script is diagnostic only. It does not change rollout state.
`);
}

/**
 * Probes one endpoint once.
 *
 * @param {string} baseUrl
 * @param {string} endpoint
 * @param {string | undefined} token
 * @param {number} attempt
 * @returns {Promise<object>}
 */
async function probeOnce(baseUrl, endpoint, token, attempt) {
  const url = `${baseUrl}${endpoint}`;
  const startMs = Date.now();
  const timestamp = new Date().toISOString();

  const needsAuth = ADMIN_ENDPOINTS.has(endpoint);
  const headers = {};
  if (needsAuth && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let httpStatus = 0;
  let contentType = null;
  let body = "";
  let cfRay = null;

  try {
    const response = await fetch(url, { method: "GET", headers });
    httpStatus = response.status;
    contentType = response.headers.get("content-type");
    cfRay = response.headers.get("cf-ray");
    body = await response.text();
  } catch (err) {
    body = `Network error: ${String(err)}`;
  }

  const durationMs = Date.now() - startMs;
  const colo = parseCfRayColo(cfRay);
  const classification = classifyResult({ status: httpStatus, contentType, body });

  const bodyExcerpt =
    !classification.jsonParseSucceeded || httpStatus !== 200
      ? body.slice(0, 160) || null
      : null;

  return {
    timestamp,
    endpoint,
    attempt,
    http_status: httpStatus,
    content_type: contentType,
    json_parse_succeeded: classification.jsonParseSucceeded,
    body_excerpt: bodyExcerpt,
    cf_ray: cfRay,
    colo,
    duration_ms: durationMs,
    is_success: classification.isSuccess,
    is_dns_cache_overflow: classification.isDnsCacheOverflow,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  const token = process.env.ADMIN_TOKEN;

  console.log("Phase 6A Preview Endpoint Reliability Probe");
  console.log(`Base URL  : ${options.baseUrl}`);
  console.log(`Attempts  : ${options.attempts}`);
  console.log(`Delay     : ${options.delayMs}ms`);
  console.log(`Output    : ${options.out}`);
  console.log(`Token set : ${token ? "yes" : "NO — admin endpoints will fail auth"}`);
  console.log("");

  const allResults = [];

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    if (attempt > 1 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }

    process.stdout.write(`Attempt ${attempt}/${options.attempts} ...`);

    const roundResults = await Promise.all(
      REQUIRED_ENDPOINTS.map((ep) => probeOnce(options.baseUrl, ep, token, attempt))
    );

    const anyFailed = roundResults.some((r) => !r.is_success);
    const dnsCacheOverflows = roundResults.filter((r) => r.is_dns_cache_overflow).length;

    if (anyFailed) {
      const failed = roundResults.filter((r) => !r.is_success).map((r) => `${r.endpoint}=${r.http_status}`);
      process.stdout.write(` FAILED [${failed.join(", ")}]`);
      if (dnsCacheOverflows > 0) process.stdout.write(` (${dnsCacheOverflows} DNS cache overflow)`);
      process.stdout.write("\n");
    } else {
      process.stdout.write(" OK\n");
    }

    allResults.push(...roundResults);
  }

  const summary = summarizeResults(allResults);

  const output = {
    probe_version: "1.0.0",
    generated_at: new Date().toISOString(),
    base_url: options.baseUrl,
    attempts_requested: options.attempts,
    delay_ms: options.delayMs,
    required_endpoints: REQUIRED_ENDPOINTS,
    diagnostic_only: true,
    results: allResults,
    summary,
  };

  const dir = dirname(options.out);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(options.out, JSON.stringify(output, null, 2), "utf-8");

  console.log("");
  console.log("=== Summary ===");
  console.log(`Total attempts per endpoint : ${summary.total_attempts_per_endpoint}`);
  console.log(`DNS cache overflow count    : ${summary.dns_cache_overflow_count}`);
  console.log(`All endpoints passed        : ${summary.all_required_endpoints_passed}`);
  console.log("");
  console.log("Failures by endpoint:");
  for (const [ep, count] of Object.entries(summary.failures_by_endpoint)) {
    console.log(`  ${ep}: ${count}`);
  }
  if (Object.keys(summary.failures_by_status).length > 0) {
    console.log("Failures by status:");
    for (const [status, count] of Object.entries(summary.failures_by_status)) {
      console.log(`  HTTP ${status}: ${count}`);
    }
  }
  if (Object.keys(summary.failures_by_colo).length > 0) {
    console.log("Failures by colo:");
    for (const [colo, count] of Object.entries(summary.failures_by_colo)) {
      console.log(`  ${colo}: ${count}`);
    }
  }
  console.log("");
  console.log(`Report written to: ${options.out}`);
  console.log("This probe does not change rollout state.");

  if (!summary.all_required_endpoints_passed) {
    console.error("\nDIAGNOSTIC RESULT: FAILURES DETECTED — 10% canary remains blocked.");
    process.exit(1);
  } else {
    console.log(
      "\nDIAGNOSTIC RESULT: All endpoints passed this probe run." +
        "\nA clean probe run does not override the formal evidence report." +
        "\nFormal readiness still requires Phase 6A evidence capture to complete successfully."
    );
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((err) => {
    console.error("Fatal:", String(err));
    process.exit(1);
  });
}
