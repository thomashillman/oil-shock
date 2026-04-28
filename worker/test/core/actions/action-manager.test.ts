import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../src/env";
import type { TriggerEventRow } from "../../../src/db/macro";

const {
  mockListUnloggedConfirmedTriggerEvents,
  mockInsertActionLog
} = vi.hoisted(() => ({
  mockListUnloggedConfirmedTriggerEvents: vi.fn<(_: Env, __: string) => Promise<TriggerEventRow[]>>(),
  mockInsertActionLog: vi.fn<(_: Env, __: Record<string, unknown>) => Promise<void>>()
}));

vi.mock("../../../src/db/macro", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/db/macro")>();
  return {
    ...actual,
    listUnloggedConfirmedTriggerEvents: mockListUnloggedConfirmedTriggerEvents,
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
    mockInsertActionLog.mockReset().mockResolvedValue();
  });

  it("writes one action_log row for a confirmed event and remains idempotent on replay", async () => {
    mockListUnloggedConfirmedTriggerEvents
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([]);

    const first = await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });
    const second = await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });

    expect(first.processedCount).toBe(1);
    expect(first.allowedCount).toBe(1);
    expect(mockInsertActionLog).toHaveBeenCalledTimes(1);
    expect(second.processedCount).toBe(0);
    expect(second.allowedCount).toBe(0);
  });

  it("ignores non-confirmed events by selecting only unlogged confirmed events", async () => {
    mockListUnloggedConfirmedTriggerEvents.mockResolvedValue([]);

    const result = await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });

    expect(result.processedCount).toBe(0);
    expect(mockInsertActionLog).not.toHaveBeenCalled();
  });

  it("returns structured counters", async () => {
    mockListUnloggedConfirmedTriggerEvents.mockResolvedValue([{ ...event, ruleKey: "energy.unknown" }]);

    const result = await runActionManagerForEngine(env(), {
      engineKey: "energy",
      nowIso: "2026-04-28T01:00:00.000Z"
    });

    expect(result).toEqual({
      processedCount: 1,
      allowedCount: 0,
      blockedCount: 0,
      ignoredCount: 1,
      errorCount: 0
    });
  });
});
