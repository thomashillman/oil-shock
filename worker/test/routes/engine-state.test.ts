import { describe, expect, it } from "vitest";
import worker from "../../src";
import type { Env } from "../../src/env";
import { createExecutionContext, createTestEnv } from "../helpers/fake-d1";
import { writeEngineScore } from "../../src/db/client";

describe("GET /api/v1/energy/state", () => {
  it("returns the latest precomputed energy score", async () => {
    const env = createTestEnv() as unknown as Env;

    await writeEngineScore(env, {
      engineKey: "energy",
      feedKey: "energy.state",
      scoredAt: "2026-04-22T00:00:00.000Z",
      scoreValue: 0.44,
      confidence: 0.81,
      flags: ["fresh"]
    });
    await writeEngineScore(env, {
      engineKey: "energy",
      feedKey: "energy.state",
      scoredAt: "2026-04-23T00:00:00.000Z",
      scoreValue: 0.62,
      confidence: 0.75,
      flags: ["missing_confirmation"]
    });

    const response = await worker.fetch(new Request("http://local/api/v1/energy/state"), env, createExecutionContext());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { engineKey: string; feedKey: string; scoreValue: number; flags: string[] };
    expect(body.engineKey).toBe("energy");
    expect(body.feedKey).toBe("energy.state");
    expect(body.scoreValue).toBe(0.62);
    expect(body.flags).toEqual(["missing_confirmation"]);
  });

  it("returns 404 when no precomputed energy score exists", async () => {
    const env = createTestEnv() as unknown as Env;
    const response = await worker.fetch(new Request("http://local/api/v1/energy/state"), env, createExecutionContext());
    expect(response.status).toBe(404);
  });
});
