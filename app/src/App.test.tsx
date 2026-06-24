import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./config", () => ({
  apiBaseUrl: "https://preview.example.com",
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

import { App } from "./App";

const mockEnergyState = {
  engineKey: "energy",
  feedKey: "energy.state",
  scoredAt: "2026-06-24T13:45:37.842Z",
  scoreValue: 0.5293333333333338,
  confidence: 0.6,
  flags: ["missing_price_confirmation"],
};

const mockEngines = {
  engines: [
    {
      engineKey: "energy",
      displayName: "Energy",
      status: "active",
      runtimeChain: ["observations", "rule_state", "trigger_events", "guardrail_policy", "action_log"],
    },
  ],
};

const mockRuntime = {
  engineKey: "energy",
  feedHealth: [
    {
      engineKey: "energy",
      feedKey: "energy_spread.diesel_wti_crack",
      displayName: "Diesel-WTI Crack Spread",
      enabled: true,
      status: "ok",
      latestCheck: {
        checkedAt: "2026-06-24T13:45:36.648Z",
        step: "save_observation",
        result: "success",
        status: "ok",
        errorMessage: null,
        latencyMs: null,
      },
    },
    {
      engineKey: "energy",
      feedKey: "energy_spread.wti_brent_spread",
      displayName: "WTI-Brent Spread",
      enabled: true,
      status: "ok",
      latestCheck: {
        checkedAt: "2026-06-24T13:45:36.648Z",
        step: "save_observation",
        result: "success",
        status: "ok",
        errorMessage: null,
        latencyMs: null,
      },
    },
  ],
  observations: [
    {
      engineKey: "energy",
      feedKey: "energy_spread.diesel_wti_crack",
      seriesKey: "energy_spread.diesel_wti_crack",
      releaseKey: "energy:energy_spread.diesel_wti_crack:2026-06-15",
      asOfDate: "2026-06-15",
      observedAt: "2026-06-15",
      value: 1,
      unit: "ratio",
      displayName: "Diesel-WTI Crack Spread",
      provider: "EIA",
      dimension: "energy_spread",
    },
    {
      engineKey: "energy",
      feedKey: "energy_spread.wti_brent_spread",
      seriesKey: "energy_spread.wti_brent_spread",
      releaseKey: "energy:energy_spread.wti_brent_spread:2026-06-15",
      asOfDate: "2026-06-15",
      observedAt: "2026-06-15",
      value: 0.01933333333333375,
      unit: "ratio",
      displayName: "WTI-Brent Spread",
      provider: "EIA",
      dimension: "energy_spread",
    },
  ],
  ruleState: [
    {
      engineKey: "energy",
      ruleKey: "energy.confirmation.spread_widening",
      stateKey: "current",
      releaseKey: "2026-06-24",
      state: {
        status: "inactive",
        spread: 0.01933333333333375,
        crack: 1,
      },
      evaluatedAt: "2026-06-24T13:45:37.842Z",
    },
  ],
  triggerEvents: [],
  actions: [],
  metadata: {
    readOnly: true,
    cpiEnabled: false,
    generatedAt: "2026-06-24T13:56:17.444Z",
  },
};

function stubFetch({
  state = mockEnergyState,
  engines = mockEngines,
  runtime = mockRuntime,
  stateOk = true,
  runtimeOk = true,
  enginesOk = true,
}: {
  state?: unknown;
  engines?: unknown;
  runtime?: unknown;
  stateOk?: boolean;
  runtimeOk?: boolean;
  enginesOk?: boolean;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/v1/energy/state")) {
        return Promise.resolve({
          ok: stateOk,
          json: async () => (stateOk ? state : { error: "no_score", message: "No precomputed energy score is available yet." }),
        });
      }
      if (url.includes("/api/engines/energy/runtime")) {
        return Promise.resolve({
          ok: runtimeOk,
          json: async () => (runtimeOk ? runtime : { error: "runtime_unavailable", message: "Runtime unavailable." }),
        });
      }
      if (url.includes("/api/engines")) {
        return Promise.resolve({
          ok: enginesOk,
          json: async () => (enginesOk ? engines : { engines: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }),
  );
}

describe("App", () => {
  it("renders the energy shell while loading", () => {
    stubFetch();
    render(<App />);
    expect(screen.getByText("Oil Shock")).toBeInTheDocument();
    expect(screen.getByText("loading…")).toBeInTheDocument();
  });

  it("renders live energy state and runtime diagnostics", async () => {
    stubFetch();
    render(<App />);

    await waitFor(() => expect(screen.queryByText("loading…")).not.toBeInTheDocument());

    // Score rendered as a number inside the gauge SVG (no % suffix on the digit itself)
    expect(screen.getByText("53")).toBeInTheDocument();
    expect(screen.getByText("missing_price_confirmation")).toBeInTheDocument();
    expect(screen.getAllByText("Energy").length).toBeGreaterThan(0);
    expect(screen.getByText("energy.confirmation.spread_widening")).toBeInTheDocument();
    // Display names now appear in both the Feed Health panel and the Observations panel.
    expect(screen.getAllByText("Diesel-WTI Crack Spread").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("WTI-Brent Spread").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("2%")).toBeInTheDocument();

    // Observations panel groups by category and explains each reading.
    expect(screen.getByText("Energy Spreads")).toBeInTheDocument();
    expect(screen.getByText("High stress")).toBeInTheDocument();
    expect(screen.getByText("Calm")).toBeInTheDocument();
    expect(
      screen.getByText("High = diesel crack spread widening, refining stress feeding through."),
    ).toBeInTheDocument();
  });

  it("surfaces a visible error when the energy state request fails", async () => {
    stubFetch({ stateOk: false });
    render(<App />);

    await waitFor(() => expect(screen.queryByText("Loading energy data…")).not.toBeInTheDocument());

    expect(screen.getByRole("alert").textContent).toMatch(/no precomputed energy score is available yet/i);
  });

  it("refreshes the live energy state on demand", async () => {
    let refreshed = false;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/admin/run-poc")) {
        refreshed = true;
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      if (url.includes("/api/v1/energy/state")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockEnergyState,
            scoreValue: refreshed ? 0.75 : 0.53,
            confidence: refreshed ? 0.85 : 0.6,
            flags: refreshed ? ["elevated_pressure"] : ["missing_price_confirmation"],
          }),
        });
      }
      if (url.includes("/api/engines/energy/runtime")) {
        return Promise.resolve({ ok: true, json: async () => mockRuntime });
      }
      if (url.includes("/api/engines")) {
        return Promise.resolve({ ok: true, json: async () => mockEngines });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await waitFor(() => expect(screen.queryByText("loading…")).not.toBeInTheDocument());
    expect(screen.getByText("53")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /refresh energy data/i }));
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/run-poc"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("75")).toBeInTheDocument());
    expect(screen.getByText("elevated_pressure")).toBeInTheDocument();
  });
});
