import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import worker from "../../src/index";
import { createTestEnv } from "../helpers/fake-d1";

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: (_promise: Promise<unknown>) => {},
    passThroughOnException: () => {}
  } as ExecutionContext;
}

describe("GET /health", () => {
  it("includes featureFlags.macroSignals=false by default", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      featureFlags: { macroSignals: boolean };
    };

    expect(body.featureFlags.macroSignals).toBe(false);
  });

  it("includes featureFlags.macroSignals=true when macro-signals mode is selected", async () => {
    const env = {
      ...(createTestEnv() as Env),
      ENABLE_MACRO_SIGNALS: "true"
    };

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      featureFlags: { macroSignals: boolean };
    };

    expect(body.featureFlags.macroSignals).toBe(true);
  });
});
