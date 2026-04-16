import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("./config", () => ({
  apiBaseUrl: "https://preview.example.com",
}));

afterEach(() => {
  vi.restoreAllMocks();
});

import { App } from "./App";

const mockState = {
  generated_at: "2026-04-16T20:00:00.000Z",
  mismatch_score: 0.72,
  actionability_state: "actionable",
  coverage_confidence: 0.9,
  source_freshness: { physical: "fresh", recognition: "fresh", transmission: "stale" },
  evidence_ids: ["ev1"],
};

const mockEvidence = {
  generated_at: "2026-04-16T20:00:00.000Z",
  evidence: [
    {
      evidence_key: "eia_crude_stocks",
      evidence_group: "physical",
      observed_at: "2026-04-10T00:00:00.000Z",
      contribution: 0.4,
      details_json: "{}",
    },
  ],
};

function stubFetch(stateOk: boolean, evidenceOk: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("/api/state")) {
        return Promise.resolve({
          ok: stateOk,
          json: async () =>
            stateOk ? mockState : { error: "no_snapshot", message: "No snapshot available." },
        });
      }
      return Promise.resolve({
        ok: evidenceOk,
        json: async () =>
          evidenceOk ? mockEvidence : { error: "no_snapshot", message: "No snapshot available." },
      });
    }),
  );
}

describe("App", () => {
  it("renders heading and loading state initially", () => {
    stubFetch(true, true);
    render(<App />);
    expect(screen.getByRole("heading", { name: "Oil Shock" })).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders state and evidence after fetch resolves", async () => {
    stubFetch(true, true);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.getAllByText("actionable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("72% mismatch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("eia_crude_stocks").length).toBeGreaterThan(0);
  });

  it("shows error message when no snapshot available", async () => {
    stubFetch(false, false);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.getAllByText("No snapshot available.").length).toBeGreaterThan(0);
  });
});
