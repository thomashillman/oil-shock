import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { runPipeline } from "../../src/jobs/run-pipeline";
import { createTestEnv } from "../helpers/fake-d1";

const { mockRunOilShockRuntimePipeline } = vi.hoisted(() => ({
  mockRunOilShockRuntimePipeline: vi.fn(async (_env: Env) => {})
}));

vi.mock("../../src/engines/oilshock/run-pipeline", () => ({
  runOilShockRuntimePipeline: mockRunOilShockRuntimePipeline
}));

function makeEnv(): Env {
  return createTestEnv() as Env;
}

describe("runPipeline", () => {
  beforeEach(() => {
    mockRunOilShockRuntimePipeline.mockReset().mockResolvedValue(undefined);
  });

  it("delegates to oil shock runtime pipeline", async () => {
    const env = makeEnv();

    await runPipeline(env);

    expect(mockRunOilShockRuntimePipeline).toHaveBeenCalledTimes(1);
    expect(mockRunOilShockRuntimePipeline).toHaveBeenCalledWith(env);
  });
});
