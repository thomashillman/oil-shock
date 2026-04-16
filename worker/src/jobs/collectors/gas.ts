import { normalizePoints } from "../../core/normalize";
import type { NormalizedPoint } from "../../types";

export function collectGas(nowIso: string): NormalizedPoint[] {
  const observedAt = nowIso;
  return normalizePoints("gas", [
    { seriesKey: "recognition.curve_signal", observedAt, value: 0.31, unit: "index" },
    { seriesKey: "transmission.crack_signal", observedAt, value: 0.58, unit: "index" }
  ]);
}
