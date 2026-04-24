import type { Env } from "../env";
import { runCollection } from "./collect";
import { runScore } from "./score";

export async function runPipeline(env: Env): Promise<void> {
  await runCollection(env);
  await runScore(env);
}
