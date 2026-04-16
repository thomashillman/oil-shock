import { normalizePoints } from "../../core/normalize";
import type { NormalizedPoint } from "../../types";

export function collectSec(nowIso: string): NormalizedPoint[] {
  return normalizePoints("sec", [
    {
      seriesKey: "transmission.impairment_mentions",
      observedAt: nowIso,
      value: 0.41,
      unit: "index"
    }
  ]);
}
