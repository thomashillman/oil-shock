import type { Env } from "../env";
import { runOilShockRuntimePipeline } from "../engines/oilshock/run-pipeline";

export async function runPipeline(env: Env): Promise<void> {
  await runOilShockRuntimePipeline(env);
}
