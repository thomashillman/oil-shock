import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/env";
import { runPipeline } from "../../src/jobs/run-pipeline";
import { createTestEnv } from "../helpers/fake-d1";

const { mockRunCollection, mockRunScore, mockGetRuntimeMode } = vi.hoisted(() => ({
  mockRunCollection: vi.fn(async (_env: Env) => {}),
  mockRunScore: vi.fn(async (_env: Env) => {}),
  mockGetRuntimeMode: vi.fn()
}));

vi.mock("../../src/jobs/collect", () => ({
  runCollection: mockRunCollection
}));

vi.mock("../../src/jobs/score", () => ({
  runScore: mockRunScore
}));

vi.mock("../../src/lib/feature-flags", () => ({
  getRuntimeMode: mockGetRuntimeMode
}));

function makeEnv(): Env {
  return createTestEnv() as Env;
}

describe("runPipeline", () => {
  beforeEach(() => {
    mockRunCollection.mockReset().mockResolvedValue(undefined);
    mockRunScore.mockReset().mockResolvedValue(undefined);
    mockGetRuntimeMode.mockReset();
  });

  it("runs the oil shock pipeline when runtime mode is oilshock", async () => {
    mockGetRuntimeMode.mockReturnValue("oilshock");

    await runPipeline(makeEnv());

    expect(mockRunCollection).toHaveBeenCalledTimes(1);
    expect(mockRunScore).toHaveBeenCalledTimes(1);
  });

  it("currently falls back to oil shock pipeline when runtime mode is macro-signals", async () => {
    mockGetRuntimeMode.mockReturnValue("macro-signals");

    await runPipeline(makeEnv());

    expect(mockRunCollection).toHaveBeenCalledTimes(1);
    expect(mockRunScore).toHaveBeenCalledTimes(1);
  });
});
