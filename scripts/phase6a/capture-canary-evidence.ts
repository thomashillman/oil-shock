#!/usr/bin/env node
/**
 * Phase 6A Canary Evidence Capture CLI
 *
 * Fetches read-only endpoints and generates an evidence report for operators.
 *
 * Usage:
 *   node capture-canary-evidence.ts --base-url https://worker.example.com
 *   Base URL from env: PHASE6A_BASE_URL=https://... node capture-canary-evidence.ts
 *   Bearer token from env: ADMIN_TOKEN=xxx node capture-canary-evidence.ts
 *   Output to file: --out evidence-report.md
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

interface CliOptions {
  baseUrl: string;
  token?: string;
  outPath?: string;
}

interface FetchOptions {
  method: string;
  headers?: Record<string, string>;
}

/**
 * Parse command-line arguments
 */
function parseArgs(): CliOptions {
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

Usage: node capture-canary-evidence.ts [options]

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
 */
async function fetchEndpoint<T>(
  url: string,
  token?: string
): Promise<T | null> {
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

    if (!response.ok) {
      console.warn(`⚠️  Endpoint ${url} returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.warn(`⚠️  Failed to fetch ${url}: ${String(error)}`);
    return null;
  }
}

/**
 * Main entry point: fetch evidence and generate report
 */
async function main(): Promise<void> {
  const options = parseArgs();
  const generatedAt = new Date().toISOString();

  console.log("Collecting evidence from read-only endpoints...");

  // Fetch all endpoints
  const [health, readiness, rolloutStatus, apiHealth] = await Promise.all([
    fetchEndpoint<HealthPayload>(`${options.baseUrl}/health`, options.token),
    fetchEndpoint<RolloutReadinessResponse>(
      `${options.baseUrl}/api/admin/rollout-readiness`,
      options.token
    ),
    fetchEndpoint<RolloutStatusResponse>(
      `${options.baseUrl}/api/admin/rollout-status`,
      options.token
    ),
    fetchEndpoint<ApiHealthResponse>(
      `${options.baseUrl}/api/admin/api-health`,
      options.token
    )
  ]);

  // Generate report
  const report = formatEvidenceReport(health, readiness, rolloutStatus, apiHealth, generatedAt);

  // Output report
  if (options.outPath) {
    try {
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

// Run main
main().catch((error) => {
  console.error("Fatal error:", String(error));
  process.exit(1);
});
