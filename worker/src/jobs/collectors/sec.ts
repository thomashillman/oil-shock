import { normalizePoints } from "../../core/normalize";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";

export async function collectSec(_env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  return normalizePoints("sec", [
    {
      seriesKey: "transmission.impairment_mentions",
      observedAt: nowIso,
      value: 0.41,
      unit: "index"
    }
  ]);
}
