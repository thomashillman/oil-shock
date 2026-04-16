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
  generatedAt: "2026-04-16T20:00:00.000Z",
  mismatchScore: 0.72,
  dislocationState: "persistent_divergence",
  stateRationale: "Physical pressure persists while market recognition lags.",
  actionabilityState: "actionable",
  confidence: {
    coverage: 0.9,
    sourceQuality: { physical: "fresh", recognition: "fresh", transmission: "stale" },
  },
  subscores: {
    physical: 0.75,
    recognition: 0.25,
    transmission: 0.68,
  },
  clocks: {
    shock: { ageSeconds: 259200, label: "3 days", classification: "acute" },
    dislocation: { ageSeconds: 432000, label: "5 days", classification: "chronic" },
    transmission: { ageSeconds: 86400, label: "24 hours", classification: "chronic" },
  },
  ledgerImpact: null,
  coverageConfidence: 0.9,
  sourceFreshness: { physical: "fresh", recognition: "fresh", transmission: "stale" },
  evidenceIds: ["ev1"],
};

const mockEvidence = {
  generatedAt: "2026-04-16T20:00:00.000Z",
  evidence: [
    {
      evidenceKey: "physical-pressure",
      evidenceGroup: "physical",
      evidenceGroupLabel: "physical_reality",
      observedAt: "2026-04-10T00:00:00.000Z",
      contribution: 0.75,
      classification: "confirming",
      coverage: "well",
      details: {},
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
    expect(screen.getAllByText("Persistent divergence").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Physical pressure persists while market recognition lags/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Physical Reality").length).toBeGreaterThan(0);
  });

  it("shows error message when no snapshot available", async () => {
    stubFetch(false, false);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.getAllByText("No snapshot available.").length).toBeGreaterThan(0);
  });
});
