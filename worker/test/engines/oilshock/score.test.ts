import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../src/env";
import { runOilShockScore } from "../../../src/engines/oilshock/score";
import { createTestEnv } from "../../helpers/fake-d1";

const { mockRunScore } = vi.hoisted(() => ({
  mockRunScore: vi.fn(async (_env: Env, _now?: Date) => {})
}));

vi.mock("../../../src/jobs/score", () => ({
  runScore: mockRunScore
}));

function makeEnv(): Env {
  return createTestEnv() as Env;
}

describe("runOilShockScore", () => {
  beforeEach(() => {
    mockRunScore.mockReset().mockResolvedValue(undefined);
  });

  it("delegates to jobs/runScore by default", async () => {
    const env = makeEnv();
    const now = new Date("2026-04-20T00:00:00.000Z");

    await runOilShockScore(env, now);

    expect(mockRunScore).toHaveBeenCalledTimes(1);
    expect(mockRunScore).toHaveBeenCalledWith(env, now);
  });
});
