import { normalizePoints } from "../../core/normalize";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";

export async function collectGas(_env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  const observedAt = nowIso;
  return normalizePoints("gas", [
    { seriesKey: "recognition.curve_signal", observedAt, value: 0.31, unit: "index" },
    { seriesKey: "transmission.crack_signal", observedAt, value: 0.58, unit: "index" }
  ]);
}
