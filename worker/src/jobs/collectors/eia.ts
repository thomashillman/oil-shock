import { normalizePoints } from "../../core/normalize";
import type { NormalizedPoint } from "../../types";

export function collectEia(nowIso: string): NormalizedPoint[] {
  const observedAt = nowIso;
  return normalizePoints("eia", [
    { seriesKey: "physical.inventory_draw", observedAt, value: 0.72, unit: "index" },
    { seriesKey: "physical.utilization", observedAt, value: 0.63, unit: "index" }
  ]);
}
