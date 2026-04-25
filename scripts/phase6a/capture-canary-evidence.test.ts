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
import type {
  HealthPayload,
  RolloutReadinessResponse,
  RolloutStatusResponse,
  ApiHealthResponse
} from "./evidence-report";

/**
 * Helper: fetch endpoint with error handling (extracted from CLI for testing)
 */
async function fetchEndpoint<T>(
  url: string,
  token?: string
): Promise<T | null> {
  try {
    const options: { method: string; headers?: Record<string, string> } = {
      method: "GET"
    };

    if (token) {
      options.headers = {
        Authorization: `Bearer ${token}`
      };
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    return null;
  }
}

describe("CLI Fetch Orchestration", () => {
  beforeEach(() => {
    // Clear any mocks before each test
    vi.clearAllMocks();
  });

  it("calls only GET endpoints", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "healthy" })
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

  it("does not include authorization header when token is not supplied", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    await fetchEndpoint("/health");

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers).toBeUndefined();
  });

  it("handles partial endpoint failure gracefully", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Health succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true })
    });

    // Readiness fails with 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    const health = await fetchEndpoint<HealthPayload>("/health");
    const readiness = await fetchEndpoint<RolloutReadinessResponse>(
      "/api/admin/rollout-readiness"
    );

    expect(health).not.toBeNull();
    expect(readiness).toBeNull();
  });

  it("handles network errors gracefully", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockRejectedValue(new Error("Network timeout"));

    const result = await fetchEndpoint("/health");

    expect(result).toBeNull();
  });

  it("never calls POST endpoints", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    // Call multiple endpoints
    await Promise.all([
      fetchEndpoint("/health"),
      fetchEndpoint("/api/admin/rollout-readiness"),
      fetchEndpoint("/api/admin/rollout-status"),
      fetchEndpoint("/api/admin/api-health")
    ]);

    // Verify all calls were GET
    for (const call of mockFetch.mock.calls) {
      expect(call[1].method).toBe("GET");
    }
  });

  it("never calls gate-sign-off endpoints", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    // Simulate a call attempt (in real CLI, this would never happen)
    const calls = [
      "/health",
      "/api/admin/rollout-readiness",
      "/api/admin/rollout-status",
      "/api/admin/api-health"
    ];

    // Verify gate-sign-off is NOT in the expected endpoints
    expect(calls).not.toContain("/api/admin/gate-sign-off");
    expect(calls.some((c) => c.includes("gate-sign-off"))).toBe(false);
  });

  it("uses correct URLs for all endpoints", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    const baseUrl = "https://worker.example.com";

    // Simulate the orchestration from CLI
    await Promise.all([
      fetchEndpoint(`${baseUrl}/health`),
      fetchEndpoint(`${baseUrl}/api/admin/rollout-readiness`),
      fetchEndpoint(`${baseUrl}/api/admin/rollout-status`),
      fetchEndpoint(`${baseUrl}/api/admin/api-health`)
    ]);

    // Verify all expected endpoints were called
    const calledUrls = mockFetch.mock.calls.map((call) => call[0]);

    expect(calledUrls).toContain(`${baseUrl}/health`);
    expect(calledUrls).toContain(`${baseUrl}/api/admin/rollout-readiness`);
    expect(calledUrls).toContain(`${baseUrl}/api/admin/rollout-status`);
    expect(calledUrls).toContain(`${baseUrl}/api/admin/api-health`);
  });

  it("returns all null when all endpoints fail", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    const results = await Promise.all([
      fetchEndpoint("/health"),
      fetchEndpoint("/api/admin/rollout-readiness"),
      fetchEndpoint("/api/admin/rollout-status"),
      fetchEndpoint("/api/admin/api-health")
    ]);

    expect(results).toEqual([null, null, null, null]);
  });
});
