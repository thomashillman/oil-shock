import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  apiBaseUrl: "https://preview.example.com"
}));

import { App } from "./App";

describe("App", () => {
  it("renders dashboard content from API payloads", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/state")) {
        return new Response(
          JSON.stringify({
            generated_at: "2026-04-16T00:00:00.000Z",
            mismatch_score: 0.42,
            actionability_state: "watch",
            coverage_confidence: 0.9,
            source_freshness: {
              physical: "fresh",
              recognition: "fresh",
              transmission: "fresh"
            },
            evidence_ids: ["physical-pressure"]
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/evidence")) {
        return new Response(
          JSON.stringify({
            generated_at: "2026-04-16T00:00:00.000Z",
            evidence: []
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/coverage")) {
        return new Response(
          JSON.stringify({
            generated_at: "2026-04-16T00:00:00.000Z",
            coverage_confidence: 0.9,
            source_freshness: {
              physical: "fresh",
              recognition: "fresh",
              transmission: "fresh"
            }
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/api/ledger/review")) {
        return new Response(
          JSON.stringify({
            review_due: []
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByRole("heading", { name: "Oil Shock MVP" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByText(/Mismatch Score/i)).toBeInTheDocument();
    expect(screen.getByText(/API: https:\/\/preview\.example\.com/)).toBeInTheDocument();
  });
});
