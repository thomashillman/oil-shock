import { describe, expect, it } from "vitest";
import type { Env } from "../../src/env";
import { getRuntimeMode, isMacroSignalsEnabled } from "../../src/lib/feature-flags";
import { createTestEnv } from "../helpers/fake-d1";

function makeEnv(flag: string | undefined): Env {
  return {
    ...(createTestEnv() as Env),
    ENABLE_MACRO_SIGNALS: flag
  };
}

describe("feature flags", () => {
  it("defaults macro signals flag to disabled", () => {
    expect(isMacroSignalsEnabled(makeEnv(undefined))).toBe(false);
    expect(isMacroSignalsEnabled(makeEnv(""))).toBe(false);
    expect(isMacroSignalsEnabled(makeEnv("false"))).toBe(false);
  });

  it("enables macro signals for accepted truthy values", () => {
    expect(isMacroSignalsEnabled(makeEnv("true"))).toBe(true);
    expect(isMacroSignalsEnabled(makeEnv("1"))).toBe(true);
    expect(isMacroSignalsEnabled(makeEnv("yes"))).toBe(true);
    expect(isMacroSignalsEnabled(makeEnv("on"))).toBe(true);
  });

  it("derives runtime mode from macro signals feature flag", () => {
    expect(getRuntimeMode(makeEnv(undefined))).toBe("oilshock");
    expect(getRuntimeMode(makeEnv("false"))).toBe("oilshock");
    expect(getRuntimeMode(makeEnv("true"))).toBe("macro-signals");
  });
});
