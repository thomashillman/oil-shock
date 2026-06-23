import type { Env } from "../env";
import { getEnergyRolloutPercent } from "../lib/feature-flags";
import { json } from "../lib/http";

export async function handleGetRolloutStatus(env: Env): Promise<Response> {
  const rolloutPercent = getEnergyRolloutPercent(env);

  return json({
    feature: "ENERGY_ROLLOUT_PERCENT",
    rolloutPercent,
    phase:
      rolloutPercent === 0
        ? "pre-rollout"
        : rolloutPercent < 20
          ? "canary-internal"
          : rolloutPercent < 80
            ? "public-expansion"
            : "full-rollout",
    description:
      rolloutPercent === 0
        ? "Energy engine not deployed"
        : rolloutPercent === 10
          ? "10% - Internal canary (dev/staging only)"
          : rolloutPercent === 50
            ? "50% - Public expansion (random traffic split)"
            : rolloutPercent === 100
              ? "100% - Full rollout (all traffic)"
              : `${rolloutPercent}% - Custom rollout percentage`,
    timestamp: new Date().toISOString()
  });
}
