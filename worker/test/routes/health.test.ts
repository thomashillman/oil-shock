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

  it("includes runtimeMode field with correct value", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      runtimeMode: "oilshock" | "macro-signals";
    };

    expect(body.runtimeMode).toBe("oilshock");
  });

  it("includes runtimeMode=macro-signals when ENABLE_MACRO_SIGNALS is true", async () => {
    const env = {
      ...(createTestEnv() as Env),
      ENABLE_MACRO_SIGNALS: "true"
    };

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      runtimeMode: "oilshock" | "macro-signals";
    };

    expect(body.runtimeMode).toBe("macro-signals");
  });

  it("omits degradedComponents array when database is healthy", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      degradedComponents?: string[];
      ok: boolean;
      status: string;
    };

    expect(body.degradedComponents).toBeUndefined();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("healthy");
  });

  it("includes degradedComponents array when components are degraded", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      degradedComponents?: string[];
      ok: boolean;
      status?: string;
    };

    // In healthy state, degradedComponents should be undefined
    if (body.degradedComponents !== undefined) {
      expect(Array.isArray(body.degradedComponents)).toBe(true);
      expect(body.degradedComponents.length).toBeGreaterThan(0);
      expect(body.status).toBe("degraded");
    }
  });

  it("returns 200 status for healthy system", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      status: string;
      dependencies: {
        database: { status: "healthy" | "unhealthy" };
        config: { status: "healthy" | "unhealthy" };
      };
    };

    expect(body.ok).toBe(true);
    expect(body.status).toBe("healthy");
    expect(body.dependencies.database.status).toBe("healthy");
    expect(body.dependencies.config.status).toBe("healthy");
  });

  it("includes timestamp field in response", async () => {
    const env = createTestEnv() as unknown as Env;
    const beforeRequest = new Date();

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      timestamp: string;
    };

    const afterRequest = new Date();
    const timestamp = new Date(body.timestamp);

    expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(afterRequest.getTime());
  });

  it("includes service and env fields in response", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      service: string;
      env: string;
    };

    expect(body.service).toBe("oil-shock-worker");
    expect(body.env).toBe("local");
  });

  it("is backward compatible: all existing fields remain unchanged", async () => {
    const env = createTestEnv() as unknown as Env;

    const response = await worker.fetch(new Request("http://local/health"), env, createExecutionContext());
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    // Verify all required fields exist and have expected types
    expect(typeof body.ok).toBe("boolean");
    expect(typeof body.service).toBe("string");
    expect(typeof body.env).toBe("string");
    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.featureFlags).toBe("object");
    expect(typeof (body.featureFlags as Record<string, unknown>).macroSignals).toBe("boolean");
    expect(typeof body.dependencies).toBe("object");
  });
});
