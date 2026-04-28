import { describe, expect, it } from "vitest";
import {
  parseCfRayColo,
  classifyResult,
  summarizeResults,
} from "../../../scripts/phase6a/probe-preview-endpoints.mjs";

describe("parseCfRayColo", () => {
  it("parses colo suffix from a standard cf-ray value", () => {
    expect(parseCfRayColo("87b8c4d8bc6d7f6c-IAD")).toBe("IAD");
  });

  it("parses a two-letter colo suffix", () => {
    expect(parseCfRayColo("aabbccddeeff0011-SY")).toBe("SY");
  });

  it("returns null for a single-letter colo suffix", () => {
    expect(parseCfRayColo("aabbccddeeff0011-X")).toBe(null);
  });

  it("parses a five-letter colo suffix", () => {
    expect(parseCfRayColo("87b8c4d8bc6d7f6c-YXZAB")).toBe("YXZAB");
  });

  it("returns null for a value with no dash", () => {
    expect(parseCfRayColo("87b8c4d8bc6d7f6c")).toBe(null);
  });

  it("returns null for an empty string", () => {
    expect(parseCfRayColo("")).toBe(null);
  });

  it("returns null for null", () => {
    expect(parseCfRayColo(null)).toBe(null);
  });

  it("returns null for undefined", () => {
    expect(parseCfRayColo(undefined)).toBe(null);
  });

  it("returns null when colo suffix contains digits or lowercase", () => {
    expect(parseCfRayColo("87b8c4d8bc6d7f6c-ia1")).toBe(null);
  });
});

describe("classifyResult", () => {
  it("classifies HTTP 503 with DNS cache overflow body as failure and dns_cache_overflow", () => {
    const result = classifyResult({
      status: 503,
      contentType: "text/plain",
      body: "DNS cache overflow",
    });
    expect(result.isSuccess).toBe(false);
    expect(result.isDnsCacheOverflow).toBe(true);
    expect(result.jsonParseSucceeded).toBe(false);
  });

  it("classifies DNS cache overflow case-insensitively", () => {
    const result = classifyResult({
      status: 503,
      contentType: "text/plain",
      body: "dns cache overflow",
    });
    expect(result.isDnsCacheOverflow).toBe(true);
  });

  it("classifies HTTP 200 with valid JSON body as success", () => {
    const result = classifyResult({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, status: "healthy" }),
    });
    expect(result.isSuccess).toBe(true);
    expect(result.isDnsCacheOverflow).toBe(false);
    expect(result.jsonParseSucceeded).toBe(true);
  });

  it("classifies HTTP 200 with non-JSON body as failure", () => {
    const result = classifyResult({
      status: 200,
      contentType: "text/html",
      body: "<html>Error</html>",
    });
    expect(result.isSuccess).toBe(false);
    expect(result.jsonParseSucceeded).toBe(false);
  });

  it("classifies HTTP 401 as failure and not dns_cache_overflow", () => {
    const result = classifyResult({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    });
    expect(result.isSuccess).toBe(false);
    expect(result.isDnsCacheOverflow).toBe(false);
  });

  it("classifies network error (status 0) as failure", () => {
    const result = classifyResult({
      status: 0,
      contentType: null,
      body: "Network error: fetch failed",
    });
    expect(result.isSuccess).toBe(false);
  });
});

describe("summarizeResults", () => {
  const makeResult = (endpoint: string, success: boolean, status = 200, colo = "IAD", dnsCacheOverflow = false) => ({
    timestamp: "2026-04-27T12:00:00.000Z",
    endpoint,
    attempt: 1,
    http_status: success ? 200 : status,
    content_type: success ? "application/json" : "text/plain",
    json_parse_succeeded: success,
    body_excerpt: success ? null : "DNS cache overflow",
    cf_ray: `87b8c4d8bc6d7f6c-${colo}`,
    colo,
    duration_ms: 100,
    is_success: success,
    is_dns_cache_overflow: dnsCacheOverflow,
  });

  it("sets all_required_endpoints_passed to true when there are no failures", () => {
    const results = [
      makeResult("/health", true),
      makeResult("/api/admin/rollout-readiness", true),
      makeResult("/api/admin/rollout-status", true),
      makeResult("/api/admin/api-health", true),
    ];
    const summary = summarizeResults(results);
    expect(summary.all_required_endpoints_passed).toBe(true);
    expect(summary.dns_cache_overflow_count).toBe(0);
  });

  it("sets all_required_endpoints_passed to false when any endpoint fails", () => {
    const results = [
      makeResult("/health", false, 503, "IAD", true),
      makeResult("/api/admin/rollout-readiness", false, 503, "IAD", true),
      makeResult("/api/admin/rollout-status", false, 503, "IAD", true),
      makeResult("/api/admin/api-health", true),
    ];
    const summary = summarizeResults(results);
    expect(summary.all_required_endpoints_passed).toBe(false);
  });

  it("counts failures by endpoint correctly", () => {
    const results = [
      makeResult("/health", false, 503, "IAD", true),
      makeResult("/api/admin/rollout-readiness", false, 503, "IAD", true),
      makeResult("/api/admin/rollout-status", true),
      makeResult("/api/admin/api-health", true),
    ];
    const summary = summarizeResults(results);
    expect(summary.failures_by_endpoint["/health"]).toBe(1);
    expect(summary.failures_by_endpoint["/api/admin/rollout-readiness"]).toBe(1);
    expect(summary.failures_by_endpoint["/api/admin/rollout-status"]).toBe(0);
    expect(summary.failures_by_endpoint["/api/admin/api-health"]).toBe(0);
  });

  it("counts dns_cache_overflow_count correctly", () => {
    const results = [
      makeResult("/health", false, 503, "IAD", true),
      makeResult("/api/admin/rollout-readiness", false, 503, "DFW", true),
      makeResult("/api/admin/rollout-status", false, 503, "ORD", false),
      makeResult("/api/admin/api-health", true),
    ];
    const summary = summarizeResults(results);
    expect(summary.dns_cache_overflow_count).toBe(2);
  });

  it("counts failures by colo correctly", () => {
    const results = [
      makeResult("/health", false, 503, "IAD", true),
      makeResult("/api/admin/rollout-readiness", false, 503, "IAD", true),
      makeResult("/api/admin/rollout-status", false, 503, "DFW", true),
      makeResult("/api/admin/api-health", true),
    ];
    const summary = summarizeResults(results);
    expect(summary.failures_by_colo["IAD"]).toBe(2);
    expect(summary.failures_by_colo["DFW"]).toBe(1);
  });

  it("summary object does not contain any token field", () => {
    const results = [makeResult("/health", true)];
    const summary = summarizeResults(results);
    const keys = Object.keys(summary);
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("admin_token");
    expect(keys).not.toContain("ADMIN_TOKEN");
    const json = JSON.stringify(summary);
    expect(json).not.toContain("token");
  });

  it("returns zero total_attempts_per_endpoint for empty results", () => {
    const summary = summarizeResults([]);
    expect(summary.total_attempts_per_endpoint).toBe(0);
    expect(summary.all_required_endpoints_passed).toBe(false);
  });
});
