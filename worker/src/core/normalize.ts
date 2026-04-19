import type { NormalizedPoint } from "../types";
import { log } from "../lib/logging";

interface RawPoint {
  seriesKey: string;
  observedAt: string;
  value: number;
  unit: string;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isValidObservedAt(observedAt: string): boolean {
  const parsed = Date.parse(observedAt);
  if (isNaN(parsed)) return false;
  const now = Date.now();
  // Drop points in the future or older than 1 year
  if (parsed > now) return false;
  if (now - parsed > ONE_YEAR_MS) return false;
  return true;
}

export function normalizePoints(sourceKey: string, rawPoints: RawPoint[]): NormalizedPoint[] {
  const result: NormalizedPoint[] = [];
  for (const point of rawPoints) {
    if (!Number.isFinite(point.value)) continue;
    if (!isValidObservedAt(point.observedAt)) {
      log("warn", "normalizePoints: dropping point with invalid observedAt", {
        seriesKey: point.seriesKey,
        observedAt: point.observedAt,
        sourceKey
      });
      continue;
    }
    result.push({
      seriesKey: point.seriesKey.trim(),
      observedAt: point.observedAt,
      value: point.value,
      unit: point.unit,
      sourceKey
    });
  }
  return result;
}
