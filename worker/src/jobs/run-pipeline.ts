import type { Env } from "../env";
import { getRuntimeMode } from "../lib/feature-flags";
import { runCollection } from "./collect";
import { runScore } from "./score";

async function runOilShockPipeline(env: Env): Promise<void> {
  await runCollection(env);
  await runScore(env);
}

async function runMacroSignalsPipeline(env: Env): Promise<void> {
  // Macro Signals runtime is not yet implemented; keep current Oil Shock path active.
  await runOilShockPipeline(env);
}

export async function runPipeline(env: Env): Promise<void> {
  const runtimeMode = getRuntimeMode(env);
  if (runtimeMode === "macro-signals") {
    await runMacroSignalsPipeline(env);
    return;
  }
  await runOilShockPipeline(env);
}
