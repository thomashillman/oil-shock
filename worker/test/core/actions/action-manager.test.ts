import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../src/env";
import type { TriggerEventRow } from "../../../src/db/macro";

const {
  mockListUnloggedConfirmedTriggerEvents,
  mockHasActionLogDecisionForKey,
  mockHasActionLogDecisionForRuleRelease,
  mockInsertActionLog
} = vi.hoisted(() => ({
  mockListUnloggedConfirmedTriggerEvents: vi.fn<(_: Env, __: string) => Promise<TriggerEventRow[]>>(),
  mockHasActionLogDecisionForKey: vi.fn<(_: Env, __: { engineKey: string; decisionKey: string }) => Promise<boolean>>(),
  mockHasActionLogDecisionForRuleRelease: vi.fn<
    (_: Env, __: { engineKey: string; ruleKey: string; releaseKey: string; decisionKey: string }) => Promise<boolean>
  >(),
  mockInsertActionLog: vi.fn<(_: Env, __: Record<string, unknown>) => Promise<void>>()
}));

vi.mock("../../../src/db/macro", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/db/macro")>();
  return {
    ...actual,
    listUnloggedConfirmedTriggerEvents: mockListUnloggedConfirmedTriggerEvents,
    hasActionLogDecisionForKey: mockHasActionLogDecisionForKey,
    hasActionLogDecisionForRuleRelease: mockHasActionLogDecisionForRuleRelease,
    insertActionLog: mockInsertActionLog
  };
});

import { runActionManagerForEngine } from "../../../src/core/actions/action-manager";

const event: TriggerEventRow = {
  engineKey: "energy",
  ruleKey: "energy.confirmation.spread_widening",
  releaseKey: "2026-04-28",
  transitionKey: "inactive->active",
  previousState: "inactive",
  newState: "active",
  status: "confirmed",
  reason: "crossed",
  runKey: "run-1",
  triggeredAt: "2026-04-28T00:00:00.000Z",
  computed: null,
  details: { spread: 0.72 }
};

function env(): Env {
  return {
    APP_ENV: "test",
    DB: {} as D1Database,
    EIA_API_KEY: "",
    GIE_API_KEY: ""
  };
}

describe("runActionManagerForEngine", () => {
  beforeEach(() => {
    mockListUnloggedConfirmedTriggerEvents.mockReset().mockResolvedValue([]);
    mockHasActionLogDecisionForKey.mockReset().mockResolvedValue(false);
    mockHasActionLogDecisionForRuleRelease.mockReset().mockResolvedValue(false);
    mockInsertActionLog.mockReset().mockResolvedValue();
  });

  it("calls guardrail-related history checks before writing action_log", async () => {
    mockListUnloggedConfirmedTriggerEvents.mockResolvedValue([event]);

    await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });

    expect(mockHasActionLogDecisionForKey).toHaveBeenCalledWith(expect.anything(), {
      engineKey: "energy",
      decisionKey: "energy:energy.confirmation.spread_widening:2026-04-28:inactive->active"
    });
    expect(mockHasActionLogDecisionForRuleRelease).toHaveBeenCalledWith(expect.anything(), {
      engineKey: "energy",
      ruleKey: "energy.confirmation.spread_widening",
      releaseKey: "2026-04-28",
      decisionKey: "energy:energy.confirmation.spread_widening:2026-04-28:inactive->active"
    });
  });

  it("writes action_log rationale from guardrail policy for supported events", async () => {
    mockListUnloggedConfirmedTriggerEvents.mockResolvedValue([event]);

    const result = await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });

    expect(result.ignoredCount).toBe(1);
    expect(mockInsertActionLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        decision: "ignored",
        actionType: "log_only",
        rationale: expect.stringContaining("no execution policy configured")
      })
    );
  });

  it("remains idempotent and does not write duplicate action_log rows on replay", async () => {
    mockListUnloggedConfirmedTriggerEvents.mockResolvedValue([event]);
    mockHasActionLogDecisionForKey.mockResolvedValue(true);

    const result = await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });

    expect(result.processedCount).toBe(1);
    expect(result.ignoredCount).toBe(1);
    expect(mockInsertActionLog).not.toHaveBeenCalled();
  });

  it("fails closed on persistence failure", async () => {
    mockListUnloggedConfirmedTriggerEvents.mockResolvedValue([event]);
    mockInsertActionLog.mockRejectedValue(new Error("action_log write failed"));

    await expect(
      runActionManagerForEngine(env(), {
        engineKey: "energy",
        nowIso: "2026-04-28T01:00:00.000Z"
      })
    ).rejects.toThrow("action_log write failed");
  });

  it("handles unsupported events as ignored decisions", async () => {
    mockListUnloggedConfirmedTriggerEvents.mockResolvedValue([{ ...event, ruleKey: "energy.unsupported" }]);

    const result = await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });

    expect(result.ignoredCount).toBe(1);
    expect(mockInsertActionLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        decision: "ignored",
        rationale: expect.stringContaining("unsupported")
      })
    );
  });
});
