#!/usr/bin/env node
/**
 * Phase 6A Canary Evidence Capture CLI
 *
 * Fetches read-only endpoints and generates an evidence report for operators.
 *
 * Usage:
 *   corepack pnpm phase6a:evidence --base-url https://worker.example.com
 *   corepack pnpm exec tsx scripts/phase6a/capture-canary-evidence.ts --base-url https://worker.example.com
 *
 * Calls only read-only endpoints:
 *   GET /health
 *   GET /api/admin/rollout-readiness
 *   GET /api/admin/rollout-status
 *   GET /api/admin/api-health
 *
 * Does NOT call:
 *   /api/admin/gate-sign-off (or any POST endpoint)
 *   Any deployment or flag-changing endpoint
 */

import { formatEvidenceReport } from "./evidence-report";
import type {
  HealthPayload,
  RolloutReadinessResponse,
  RolloutStatusResponse,
  ApiHealthResponse
} from "./evidence-report";
import * as fs from "fs";
import * as path from "path";

export interface CliOptions {
  baseUrl: string;
  token?: string;
  outPath?: string;
}

interface FetchOptions {
  method: string;
  headers?: Record<string, string>;
}

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Endpoint evidence envelope that preserves HTTP status and error metadata
 * Allows reports to show that an endpoint returned HTTP 503 even with JSON body
 */
export interface EndpointEvidence<T> {
  endpoint: string;
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Parse command-line arguments
 */
export function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    baseUrl: process.env.PHASE6A_BASE_URL || ""
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base-url" && i + 1 < args.length) {
      options.baseUrl = args[++i];
    } else if (args[i] === "--out" && i + 1 < args.length) {
      options.outPath = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  // Load token from environment
  options.token = process.env.ADMIN_TOKEN || process.env.ADMIN_API_BEARER_TOKEN;

  if (!options.baseUrl) {
    console.error("Error: base-url required. Set --base-url or PHASE6A_BASE_URL env var");
    printHelp();
    process.exit(1);
  }

  return options;
}

/**
 * Print usage help
 */
function printHelp(): void {
  console.log(`
Phase 6A Canary Evidence Capture

Usage: corepack pnpm phase6a:evidence [options]

Options:
  --base-url <url>      Base URL of worker (or PHASE6A_BASE_URL env var)
  --out <path>          Write report to file instead of stdout
  --help                Show this help

Environment Variables:
  PHASE6A_BASE_URL      Worker base URL
  ADMIN_TOKEN           Bearer token for admin endpoints
  ADMIN_API_BEARER_TOKEN  Alternative token env var

This tool calls only read-only endpoints:
  GET /health
  GET /api/admin/rollout-readiness
  GET /api/admin/rollout-status
  GET /api/admin/api-health

It does NOT call any POST endpoints, gate sign-off endpoints, or deployment commands.
`);
}

/**
 * Fetch a read-only endpoint with error handling
 * Returns both status and parsed data, even on error.
 * Treats JSON parse failures as endpoint failures even on HTTP 200.
 */
export async function fetchEndpoint<T>(
  url: string,
  token?: string
): Promise<FetchResult<T>> {
  try {
    const options: FetchOptions = {
      method: "GET"
    };

    if (token) {
      options.headers = {
        Authorization: `Bearer ${token}`
      };
    }

    const response = await fetch(url, options);
    let data: T | null = null;
    let parseError: string | undefined;

    try {
      data = await response.json();
    } catch (error) {
      // JSON parse failed: treat as endpoint failure even on HTTP 200
      parseError = `Failed to parse JSON response: ${String(error)}`;
    }

    return {
      ok: response.ok && data !== null && !parseError,
      status: response.status,
      data,
      error: parseError || (!response.ok ? `HTTP ${response.status}` : undefined)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Network error: ${String(error)}`
    };
  }
}

/**
 * Collect evidence from all read-only endpoints
 * Returns full endpoint evidence (status, error, data) not just data
 */
export async function collectEvidence(baseUrl: string, token?: string) {
  const [healthResult, readinessResult, statusResult, apiHealthResult] = await Promise.all([
    fetchEndpoint<HealthPayload>(`${baseUrl}/health`, token),
    fetchEndpoint<RolloutReadinessResponse>(
      `${baseUrl}/api/admin/rollout-readiness`,
      token
    ),
    fetchEndpoint<RolloutStatusResponse>(
      `${baseUrl}/api/admin/rollout-status`,
      token
    ),
    fetchEndpoint<ApiHealthResponse>(
      `${baseUrl}/api/admin/api-health`,
      token
    )
  ]);

  return {
    health: {
      endpoint: "/health",
      ok: healthResult.ok,
      status: healthResult.status,
      data: healthResult.data,
      error: healthResult.error
    } as EndpointEvidence<HealthPayload>,
    readiness: {
      endpoint: "/api/admin/rollout-readiness",
      ok: readinessResult.ok,
      status: readinessResult.status,
      data: readinessResult.data,
      error: readinessResult.error
    } as EndpointEvidence<RolloutReadinessResponse>,
    status: {
      endpoint: "/api/admin/rollout-status",
      ok: statusResult.ok,
      status: statusResult.status,
      data: statusResult.data,
      error: statusResult.error
    } as EndpointEvidence<RolloutStatusResponse>,
    apiHealth: {
      endpoint: "/api/admin/api-health",
      ok: apiHealthResult.ok,
      status: apiHealthResult.status,
      data: apiHealthResult.data,
      error: apiHealthResult.error
    } as EndpointEvidence<ApiHealthResponse>
  };
}

/**
 * Main entry point: fetch evidence and generate report
 */
export async function runCli(options: CliOptions): Promise<void> {
  const generatedAt = new Date().toISOString();

  console.log("Collecting evidence from read-only endpoints...");

  // Fetch all endpoints
  const evidence = await collectEvidence(options.baseUrl, options.token);

  // Generate report
  const report = formatEvidenceReport(
    evidence.health,
    evidence.readiness,
    evidence.status,
    evidence.apiHealth,
    generatedAt
  );

  // Output report
  if (options.outPath) {
    try {
      // Create parent directory recursively if needed
      const parentDir = path.dirname(options.outPath);
      if (parentDir !== ".") {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(options.outPath, report, "utf-8");
      console.log(`✅ Report written to ${options.outPath}`);
    } catch (error) {
      console.error(`❌ Failed to write report: ${String(error)}`);
      process.exit(1);
    }
  } else {
    console.log("\n" + "=".repeat(80) + "\n");
    console.log(report);
  }
}

// Only run CLI if this is the main module (not imported for testing)
if (require.main === module) {
  const options = parseArgs();
  runCli(options).catch((error) => {
    console.error("Fatal error:", String(error));
    process.exit(1);
  });
}
