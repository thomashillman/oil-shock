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
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("68%").length).toBeGreaterThan(0);
  });

  it("renders non-zero subscores when numeric fields are strings", async () => {
    stubFetchWithStatePayload(mockStringifiedNumericState);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.getAllByText("35%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("30%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20%").length).toBeGreaterThan(0);
    expect(screen.queryByText("NaN%")).not.toBeInTheDocument();
  });

  it("renders subscore bars with non-zero percentages for all three dimensions", async () => {
    stubFetch(true, true);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    // Subscore labels must render with the user-selected wording.
    expect(screen.getByText("Physical pressure")).toBeInTheDocument();
    expect(screen.getAllByText("Price signal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Market response").length).toBeGreaterThan(0);
    // Percentages from mockState: 75%, 25%, 68%.
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("68%").length).toBeGreaterThan(0);
  });

  it("renders concrete subscore percentages from snake_case top-level and non-canonical nested keys", async () => {
    stubFetchWithStatePayload(mockSnakeCaseStateWithNonCanonicalNestedKeys);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());

    expect(screen.queryAllByText("NaN%")).toHaveLength(0);
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("68%").length).toBeGreaterThan(0);
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
    // POST succeeds. GET /api/state always returns the same generatedAt so the poll
    // loop never sees a "new" snapshot and the 90s deadline must trip.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.includes("/api/admin/run-poc")) {
          return Promise.resolve({ ok: true, status: 202, json: async () => ({}) });
        }
        if (url.includes("/api/state/history")) {
          return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
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

  it("loads dashboard drill-down with rules and guardrails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/state/history")) {
          return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
        }
        if (url.includes("/api/state")) {
          return Promise.resolve({ ok: true, json: async () => mockState });
        }
        if (url.includes("/api/evidence")) {
          return Promise.resolve({ ok: true, json: async () => mockEvidence });
        }
        if (url.includes("/api/admin/rules")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ rules: [{ ruleKey: "oilshock.recognition_gap_bonus", name: "x", weight: 0.03, predicate: {} }] }),
          });
        }
        if (url.includes("/api/admin/guardrails/failures")) {
          return Promise.resolve({ ok: true, json: async () => ({ failures: ["stale_dimension:priceSignal"] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Dashboard" }));
    });

    await waitFor(() => expect(screen.getByText("stale_dimension:priceSignal")).toBeInTheDocument());
    expect(screen.getByText(/oilshock.recognition_gap_bonus/)).toBeInTheDocument();
    expect(screen.getByText("Engine inventory")).toBeInTheDocument();
    expect(screen.getByText("WTI spot")).toBeInTheDocument();
  });

  it("validates rule syntax and blocks invalid preview", async () => {
    stubFetch(true, true);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Rule editor" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /advanced json mode/i }));
    fireEvent.change(screen.getByLabelText("Predicate JSON"), { target: { value: "{" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Preview impact" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/unable to preview rule/i);
  });

  it("requires numeric weight before previewing rule impact", async () => {
    stubFetch(true, true);
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Rule editor" }));
    fireEvent.change(screen.getByLabelText("Rule weight"), { target: { value: "abc" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Preview impact" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/weight must be numeric/i);
  });


  it("exports backfill rows as csv", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    const clickMock = vi.fn();
    const realCreateElement = document.createElement.bind(document);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = realCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        (element as HTMLAnchorElement).click = clickMock;
      }
      return element;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/state/history")) {
          return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
        }
        if (url.includes("/api/state")) {
          return Promise.resolve({ ok: true, json: async () => mockState });
        }
        if (url.includes("/api/evidence")) {
          return Promise.resolve({ ok: true, json: async () => mockEvidence });
        }
        if (url.includes("/api/admin/backfill/rescore")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              comparisons: [{ generatedAt: "2026-04-20T00:00:00.000Z", baselineScore: 0.2, rescoredWithOverride: 0.3 }],
            }),
          });
        }
        if (url.includes("/api/admin/rules")) {
          return Promise.resolve({ ok: true, json: async () => ({ rules: [] }) });
        }
        if (url.includes("/api/admin/guardrails/failures")) {
          return Promise.resolve({ ok: true, json: async () => ({ failures: [] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Backfill" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run historical re-score" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("renders backfill analysis table and summary metrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/state/history")) {
          return Promise.resolve({ ok: true, json: async () => ({ history: [] }) });
        }
        if (url.includes("/api/state")) {
          return Promise.resolve({ ok: true, json: async () => mockState });
        }
        if (url.includes("/api/evidence")) {
          return Promise.resolve({ ok: true, json: async () => mockEvidence });
        }
        if (url.includes("/api/admin/backfill/rescore")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              comparisons: [
                { generatedAt: "2026-04-20T00:00:00.000Z", baselineScore: 0.2, rescoredWithOverride: 0.3 },
                { generatedAt: "2026-04-19T00:00:00.000Z", baselineScore: 0.4, rescoredWithOverride: 0.35 },
              ],
            }),
          });
        }
        if (url.includes("/api/admin/rules")) {
          return Promise.resolve({ ok: true, json: async () => ({ rules: [] }) });
        }
        if (url.includes("/api/admin/guardrails/failures")) {
          return Promise.resolve({ ok: true, json: async () => ({ failures: [] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );

    render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Backfill" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run historical re-score" }));
    });
    expect(await screen.findByText("Avg delta")).toBeInTheDocument();
    expect(screen.getByText("Generated")).toBeInTheDocument();
    expect(screen.getByText("2026-04-20T00:00:00.000Z")).toBeInTheDocument();
  });
});
