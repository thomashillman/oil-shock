import { describe, expect, it, vi } from "vitest";
import { writeSnapshot } from "../../src/db/client";
import type { Env } from "../../src/env";
import type { StateSnapshot } from "../../src/types";

const baseSnapshot: StateSnapshot = {
  generatedAt: "2026-04-23T00:00:00.000Z",
  mismatchScore: 0.62,
  actionabilityState: "watch",
  coverageConfidence: 0.8,
  sourceFreshness: {
    physicalStress: "fresh",
    priceSignal: "fresh",
    marketResponse: "stale"
  },
  evidenceIds: ["ev-1"],
  dislocationState: "mild_divergence",
  stateRationale: "test",
  subscores: {
    physicalStress: 0.7,
    priceSignal: 0.4,
    marketResponse: 0.5
  },
  confidence: {
    coverage: 0.8,
    sourceQuality: {
      physicalStress: "fresh",
      priceSignal: "fresh",
      marketResponse: "stale"
    }
  },
  clocks: {
    shock: { ageSeconds: 100, label: "fresh", classification: "acute" },
    dislocation: { ageSeconds: 100, label: "fresh", classification: "acute" },
    transmission: { ageSeconds: 100, label: "fresh", classification: "acute" }
  },
  ledgerImpact: null,
  guardrailFlags: []
};

function makeEnv(prepare: (query: string) => { bind: (...params: unknown[]) => { run: () => Promise<unknown> } }, dualWrite?: string): Env {
  return {
    APP_ENV: "local",
    PRODUCTION_ORIGIN: "",
    EIA_API_KEY: "",
    GIE_API_KEY: "",
    ENABLE_SCORE_DUAL_WRITE: dualWrite,
    DB: { prepare }
  } as unknown as Env;
}

describe("writeSnapshot dual write", () => {
  it("writes to scores when ENABLE_SCORE_DUAL_WRITE is enabled", async () => {
    const runSpy = vi
      .fn()
      .mockResolvedValueOnce({ meta: { last_row_id: 42 } })
      .mockResolvedValueOnce({ meta: { last_row_id: 100 } });
    const prepareSpy = vi.fn(() => ({ bind: vi.fn().mockReturnValue({ run: runSpy }) }));

    await writeSnapshot(makeEnv(prepareSpy, "1"), baseSnapshot, "score-123");

    expect(prepareSpy).toHaveBeenCalledTimes(2);
    expect(prepareSpy.mock.calls[1][0]).toContain("INSERT INTO scores");
  });

  it("does not write to scores when dual-write flag is falsey", async () => {
    const falseyFlags = [undefined, "", " ", "0", "false", "off", "no"];

    for (const flag of falseyFlags) {
      const runSpy = vi.fn().mockResolvedValueOnce({ meta: { last_row_id: 42 } });
      const prepareSpy = vi.fn(() => ({ bind: vi.fn().mockReturnValue({ run: runSpy }) }));

      await writeSnapshot(makeEnv(prepareSpy, flag), baseSnapshot, "score-123");

      expect(prepareSpy).toHaveBeenCalledTimes(1);
      expect(prepareSpy.mock.calls[0][0]).toContain("INSERT INTO signal_snapshots");
    }
  });

  it("treats accepted true values as enabled", async () => {
    const truthyFlags = ["1", "true", "yes", "on", "TRUE", " Yes "];

    for (const flag of truthyFlags) {
      const runSpy = vi
        .fn()
        .mockResolvedValueOnce({ meta: { last_row_id: 42 } })
        .mockResolvedValueOnce({ meta: { last_row_id: 100 } });
      const prepareSpy = vi.fn(() => ({ bind: vi.fn().mockReturnValue({ run: runSpy }) }));

      await writeSnapshot(makeEnv(prepareSpy, flag), baseSnapshot, "score-123");
      expect(prepareSpy).toHaveBeenCalledTimes(2);
    }
  });

  it("binds expected payload for scores dual write", async () => {
    const runSpy = vi
      .fn()
      .mockResolvedValueOnce({ meta: { last_row_id: 55 } })
      .mockResolvedValueOnce({ meta: { last_row_id: 88 } });

    const bindCalls: unknown[][] = [];
    const prepareSpy = vi.fn(() => ({
      bind: (...params: unknown[]) => {
        bindCalls.push(params);
        return { run: runSpy };
      }
    }));

    await writeSnapshot(makeEnv(prepareSpy, "true"), baseSnapshot, "score-123");

    const scoreBind = bindCalls[1];
    expect(scoreBind[0]).toBe("oil_shock");
    expect(scoreBind[1]).toBe("oil_shock.mismatch_score");
    expect(scoreBind[2]).toBe(baseSnapshot.generatedAt);
    expect(scoreBind[3]).toBe(baseSnapshot.mismatchScore);
    expect(scoreBind[4]).toBe(baseSnapshot.coverageConfidence);
    expect(scoreBind[6]).toBe(55);
    expect(scoreBind[7]).toBe("score-123");

    expect(JSON.parse(String(scoreBind[5]))).toEqual({
      state: baseSnapshot.dislocationState,
      stateRationale: baseSnapshot.stateRationale,
      actionabilityState: baseSnapshot.actionabilityState,
      subscores: baseSnapshot.subscores,
      clocks: baseSnapshot.clocks,
      ledgerImpact: baseSnapshot.ledgerImpact,
      sourceFreshness: baseSnapshot.sourceFreshness,
      guardrailFlags: baseSnapshot.guardrailFlags,
      confidence: baseSnapshot.confidence
    });
  });

  it("rejects when dual write is enabled and scores insert fails", async () => {
    const runSpy = vi
      .fn()
      .mockResolvedValueOnce({ meta: { last_row_id: 42 } })
      .mockRejectedValueOnce(new Error("scores insert failed"));
    const prepareSpy = vi.fn(() => ({ bind: vi.fn().mockReturnValue({ run: runSpy }) }));

    await expect(writeSnapshot(makeEnv(prepareSpy, "on"), baseSnapshot, "score-123")).rejects.toThrow(
      "scores insert failed"
    );
    expect(prepareSpy).toHaveBeenCalledTimes(2);
  });
});
