/**
 * Tests for Phase 6A Evidence Capture CLI
 *
 * These tests verify the CLI's fetch orchestration without making network calls.
 * They mock the global fetch function to ensure:
 * - Only GET endpoints are called
 * - Bearer token is included when supplied
 * - Partial endpoint failure is handled gracefully
 * - No POST endpoints or write operations occur
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchEndpoint, collectEvidence } from "../../../scripts/phase6a/capture-canary-evidence";
import type { PerFeedHealth, ApiHealthResponse } from "../../../scripts/phase6a/evidence-report";

describe("Phase 6A Evidence Capture CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchEndpoint", () => {
    it("calls only GET endpoints", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true })
      });

      await fetchEndpoint("/health");

      // Verify only one call was made
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify it was a GET request
      const call = mockFetch.mock.calls[0];
      expect(call[1]).toMatchObject({
        method: "GET"
      });
    });

    it("includes bearer token in authorization header when supplied", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      const token = "test-token-abc123";
      await fetchEndpoint("/api/admin/rollout-readiness", token);

      const call = mockFetch.mock.calls[0];
      expect(call[1]).toMatchObject({
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    });

    it("returns OK result when response is successful", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, service: "oil-shock-worker" })
      });

      const result = await fetchEndpoint("/health");

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ ok: true, service: "oil-shock-worker" });
      expect(result.error).toBeUndefined();
    });

    it("returns error result when response is not OK but JSON parses", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          ok: false,
          status: "unavailable",
          degradedComponents: ["database"]
        })
      });

      const result = await fetchEndpoint("/health");

      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      expect(result.data).toEqual({
        ok: false,
        status: "unavailable",
        degradedComponents: ["database"]
      });
      expect(result.error).toBe("HTTP 503");
    });

    it("handles network errors gracefully", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockRejectedValue(new Error("Network timeout"));

      const result = await fetchEndpoint("/health");

      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
      expect(result.data).toBeNull();
      expect(result.error).toContain("Network error");
    });

    it("never includes authorization when token is not supplied", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      await fetchEndpoint("/health");

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers).toBeUndefined();
    });
  });

  describe("collectEvidence", () => {
    it("calls exactly the required GET endpoints with real shapes", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, service: "oil-shock-worker" })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: "ready",
            blockers: [],
            warnings: [],
            manualChecks: []
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            rolloutPercent: 0,
            phase: "pre-rollout"
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            generatedAt: "2026-04-25T12:00:00Z",
            systemHealthy: true,
            unhealthyFeeds: [],
            feeds: [],
            summary: { totalFeeds: 0, healthyFeeds: 0, degradedFeeds: 0, downFeeds: 0 }
          })
        });

      await collectEvidence("https://worker.example.com", "token123");

      // Verify 4 calls were made
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verify exact endpoints
      const urls = mockFetch.mock.calls.map((call) => call[0]);
      expect(urls).toContain("https://worker.example.com/health");
      expect(urls).toContain("https://worker.example.com/api/admin/rollout-readiness");
      expect(urls).toContain("https://worker.example.com/api/admin/rollout-status");
      expect(urls).toContain("https://worker.example.com/api/admin/api-health");
    });

    it("never calls POST endpoints or gate-sign-off", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      await collectEvidence("https://worker.example.com");

      // Verify all calls are GET
      for (const call of mockFetch.mock.calls) {
        expect(call[1].method).toBe("GET");
      }

      // Verify gate-sign-off is never called
      const urls = mockFetch.mock.calls.map((call) => call[0]);
      expect(urls.some((url) => url.includes("gate-sign-off"))).toBe(false);
      expect(urls.some((url) => url.includes("POST"))).toBe(false);
    });

    it("preserves HTTP 503 status with JSON body in endpoint evidence", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      // Health succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true })
      });

      // Readiness fails with 503 but has JSON body
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ status: "unavailable" })
      });

      // Status succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rolloutPercent: 0 })
      });

      // API Health succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          generatedAt: "2026-04-25T12:00:00Z",
          systemHealthy: true,
          feeds: []
        })
      });

      const evidence = await collectEvidence("https://worker.example.com");

      // Health should succeed
      expect(evidence.health.ok).toBe(true);
      expect(evidence.health.status).toBe(200);

      // Readiness should preserve 503 status AND data
      expect(evidence.readiness.ok).toBe(false);
      expect(evidence.readiness.status).toBe(503);
      expect(evidence.readiness.data).toEqual({ status: "unavailable" });
      expect(evidence.readiness.error).toBe("HTTP 503");

      // Status and apiHealth should succeed
      expect(evidence.status.ok).toBe(true);
      expect(evidence.apiHealth.ok).toBe(true);
    });

    it("returns endpoint evidence with ok=false and error message when endpoints fail", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => null
      });

      const evidence = await collectEvidence("https://worker.example.com");

      // All endpoints should have ok=false with error messages
      expect(evidence.health.ok).toBe(false);
      expect(evidence.health.status).toBe(500);
      expect(evidence.health.error).toBe("HTTP 500");

      expect(evidence.readiness.ok).toBe(false);
      expect(evidence.status.ok).toBe(false);
      expect(evidence.apiHealth.ok).toBe(false);
    });

    it("includes bearer token in all requests when supplied", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      const token = "my-token";
      await collectEvidence("https://worker.example.com", token);

      // All 4 calls should include the token
      for (const call of mockFetch.mock.calls) {
        expect(call[1].headers).toEqual({ Authorization: `Bearer ${token}` });
      }
    });
  });

  describe("real API health payload shape", () => {
    it("renders real PerFeedHealth payload correctly", async () => {
      const { formatEvidenceReport, type: EndpointEvidenceType } = await import(
        "../../../scripts/phase6a/evidence-report"
      );

      const feed: PerFeedHealth = {
        feedName: "eia_wti",
        provider: "EIA",
        displayName: "EIA WTI Spot",
        status: "OK",
        latencyP95Ms: 250,
        errorRatePct: 0.5,
        lastSuccessfulAt: "2026-04-25T11:55:00Z",
        lastAttemptedAt: "2026-04-25T11:56:00Z",
        attemptCount1h: 60,
        successCount1h: 59,
        failureCount1h: 1,
        timeoutCount1h: 0
      };

      const apiHealth: ApiHealthResponse = {
        generatedAt: "2026-04-25T12:00:00Z",
        systemHealthy: true,
        unhealthyFeeds: [],
        feeds: [feed],
        summary: {
          totalFeeds: 1,
          healthyFeeds: 1,
          degradedFeeds: 0,
          downFeeds: 0
        }
      };

      const apiHealthEvidence = {
        endpoint: "/api/admin/api-health",
        ok: true,
        status: 200,
        data: apiHealth
      };

      const report = formatEvidenceReport(null, null, null, apiHealthEvidence, "2026-04-25T12:00:00Z");

      expect(report).toContain("EIA WTI Spot");
      expect(report).toContain("eia_wti");
      expect(report).toContain("0.5%");
      expect(report).toContain("250ms");
    });
  });
});
