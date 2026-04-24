import type { Env } from "../env";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
export type RuntimeMode = "oilshock" | "macro-signals";

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export function isMacroSignalsEnabled(env: Env): boolean {
  return parseBooleanFlag(env.ENABLE_MACRO_SIGNALS);
}

export function isPhase1ParallelRunningEnabled(env: Env): boolean {
  return parseBooleanFlag(env.ENABLE_PHASE1_PARALLEL_RUNNING);
}

export function getRuntimeMode(env: Env): RuntimeMode {
  return isMacroSignalsEnabled(env) ? "macro-signals" : "oilshock";
}
