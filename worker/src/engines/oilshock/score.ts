import type { Env } from "../../env";
import { runScore } from "../../jobs/score";

export type OilShockScoreRunner = (env: Env, now?: Date) => Promise<void>;

const defaultScoreRunner: OilShockScoreRunner = runScore;

export async function runOilShockScore(
  env: Env,
  now?: Date,
  scoreRunner: OilShockScoreRunner = defaultScoreRunner
): Promise<void> {
  await scoreRunner(env, now);
}
