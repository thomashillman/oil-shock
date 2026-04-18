import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import { getLatestSnapshot } from "../../src/db/client";
import { runCollection } from "../../src/jobs/collect";
import { runScore } from "../../src/jobs/score";
import { createTestEnv } from "../helpers/fake-d1";

describe("pipeline integration", () => {
  it("runs collect then score and writes a coherent snapshot", async () => {
    const env = createTestEnv() as unknown as Env;

    await runCollection(env, new Date("2026-04-16T00:00:00.000Z"));
    await runScore(env, new Date("2026-04-16T00:00:00.000Z"));

    const snapshot = await getLatestSnapshot(env);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.actionability_state).toMatch(/none|watch|actionable/);
    expect(snapshot?.mismatch_score).toBeTypeOf("number");
    expect(snapshot?.coverage_confidence).toBeTypeOf("number");
  }, 30000);
});
