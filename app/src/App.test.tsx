import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("./config", () => ({
  apiBaseUrl: "https://preview.example.com",
}));

afterEach(() => {
  cleanup();
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
    sourceQuality: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "stale" },
  },
  subscores: {
    physicalStress: 0.75,
    priceSignal: 0.25,
    marketResponse: 0.68,
  },
  clocks: {
    shock: { ageSeconds: 259200, label: "3 days", classification: "acute" },
    dislocation: { ageSeconds: 432000, label: "5 days", classification: "chronic" },
    transmission: { ageSeconds: 86400, label: "24 hours", classification: "chronic" },
  },
  ledgerImpact: null,
  coverageConfidence: 0.9,
  sourceFreshness: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "stale" },
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

const mockSnakeCaseState = {
  generated_at: "2026-04-16T20:00:00.000Z",
  mismatch_score: 0.72,
  dislocation_state: "persistent_divergence",
  state_rationale: "Physical pressure persists while market recognition lags.",
  actionability_state: "actionable",
  confidence: {
    coverage: 0.9,
    sourceQuality: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "stale" },
  },
  subscores: {
    physicalStress: 0.75,
    priceSignal: 0.25,
    marketResponse: 0.68,
  },
  clocks: {
    shock: { ageSeconds: 259200, label: "3 days", classification: "acute" },
    dislocation: { ageSeconds: 432000, label: "5 days", classification: "chronic" },
    transmission: { ageSeconds: 86400, label: "24 hours", classification: "chronic" },
  },
  ledger_impact: null,
  coverage_confidence: 0.9,
  source_freshness: { physicalStress: "fresh", priceSignal: "fresh", marketResponse: "stale" },
  evidence_ids: ["ev1"],
};

const mockNestedSnakeCaseState = {
  ...mockSnakeCaseState,
  subscores: {
    physical_stress: 0.75,
    price_signal: 0.25,
    market_response: 0.68,
  },
  source_freshness: {
    physical_stress: "fresh",
    price_signal: "fresh",
    market_response: "stale",
  },
};

const mockStringifiedNumericState = {
  ...mockNestedSnakeCaseState,
  mismatch_score: "0.03",
  coverage_confidence: "1",
  subscores: {
    physical_stress: "0.35",
    price_signal: "0.3",
    market_response: "0.2",
  },
};

const mockSnakeCaseStateWithNonCanonicalNestedKeys = {
  ...mockSnakeCaseState,
  subscores: {
    physical_stress: 0.75,
    price_signal: 0.25,
    market_response: 0.68,
  },
  source_freshness: {
    physical_stress: "fresh",
    price_signal: "fresh",
    market_response: "stale",
  },
};

function stubFetch(stateOk: boolean, evidenceOk: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("/api/state/history")) {
        return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
      }
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

function stubFetchWithStatePayload(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("/api/state/history")) {
        return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
      }
      if ((url as string).includes("/api/state")) {
        return Promise.resolve({
          ok: true,
          json: async () => payload,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockEvidence,
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

  it("renders state data from snake_case payloads", async () => {
    stubFetchWithStatePayload(mockSnakeCaseState);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.getAllByText("Persistent divergence").length).toBeGreaterThan(0);
  });

  it("renders subscore bars from nested snake_case payloads", async () => {
    stubFetchWithStatePayload(mockNestedSnakeCaseState);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
  });

  it("renders non-zero subscores when numeric fields are strings", async () => {
    stubFetchWithStatePayload(mockStringifiedNumericState);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.queryByText("NaN%")).not.toBeInTheDocument();
  });

  it("renders subscore bars with non-zero percentages for all three dimensions", async () => {
    stubFetch(true, true);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    // Subscore labels must render with the user-selected wording.
    expect(screen.getByText("Physical pressure")).toBeInTheDocument();
    expect(screen.getByText("Price signal")).toBeInTheDocument();
    expect(screen.getByText("Market response")).toBeInTheDocument();
    // Percentages from mockState: 75%, 25%, 68%.
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
  });

  it("renders concrete subscore percentages from snake_case top-level and non-canonical nested keys", async () => {
    stubFetchWithStatePayload(mockSnakeCaseStateWithNonCanonicalNestedKeys);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    expect(screen.queryAllByText("NaN%")).toHaveLength(0);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("68%")).toBeInTheDocument();
  });

  it("surfaces a visible error when Recalculate POST returns 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.includes("/api/admin/run-poc")) {
          return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
        }
        if (url.includes("/api/state/history")) {
          return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
        }
        if (url.includes("/api/admin/run-status")) {
          return Promise.resolve({ ok: true, json: async () => ({ status: "running" }) });
        }
        if (url.includes("/api/state")) {
          return Promise.resolve({ ok: true, json: async () => mockState });
        }
        return Promise.resolve({ ok: true, json: async () => mockEvidence });
      }),
    );
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    const recalcButton = screen.getByRole("button", { name: /recalculate/i });
    await act(async () => {
      fireEvent.click(recalcButton);
    });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/recalculation failed/i);
    expect(screen.getByRole("alert").textContent).toMatch(/500/);
    // Spinner should have stopped — the button shows the idle label again.
    expect(screen.getByRole("button", { name: /recalculate/i }).textContent).toMatch(/^\s*↺\s*Recalculate\s*$/);
  });

  it("surfaces a timeout error when the new snapshot never arrives within the deadline", async () => {
    // POST succeeds, but run-status stays "running" forever so timeout still acts as fallback.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.includes("/api/admin/run-poc")) {
          return Promise.resolve({ ok: true, status: 202, json: async () => ({ runKey: "admin-recalc-1" }) });
        }
        if (url.includes("/api/state/history")) {
          return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
        }
        if (url.includes("/api/admin/run-status")) {
          return Promise.resolve({ ok: true, json: async () => ({ runKey: "admin-recalc-1", status: "running" }) });
        }
        if (url.includes("/api/state")) {
          return Promise.resolve({ ok: true, json: async () => mockState });
        }
        return Promise.resolve({ ok: true, json: async () => mockEvidence });
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    const recalcButton = screen.getByRole("button", { name: /recalculate/i });
    await act(async () => {
      fireEvent.click(recalcButton);
    });

    // Advance past the 90s deadline — the next poll tick must hit the timeout branch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(95_000);
    });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/timed out/i);

    vi.useRealTimers();
  });

  it("surfaces backend run failure immediately while polling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.includes("/api/admin/run-poc")) {
          return Promise.resolve({ ok: true, status: 202, json: async () => ({ runKey: "admin-recalc-2" }) });
        }
        if (url.includes("/api/state/history")) {
          return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
        }
        if (url.includes("/api/admin/run-status")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ runKey: "admin-recalc-2", status: "failed", details: { error: "Collector exploded" } }),
          });
        }
        if (url.includes("/api/state")) {
          return Promise.resolve({ ok: true, json: async () => mockState });
        }
        return Promise.resolve({ ok: true, json: async () => mockEvidence });
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    const recalcButton = screen.getByRole("button", { name: /recalculate/i });
    await act(async () => {
      fireEvent.click(recalcButton);
      await vi.advanceTimersByTimeAsync(4_000);
    });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/collector exploded/i);

    vi.useRealTimers();
  });
});
