import type { NormalizedPoint } from "../types";

interface RawPoint {
  seriesKey: string;
  observedAt: string;
  value: number;
  unit: string;
}

export function normalizePoints(sourceKey: string, rawPoints: RawPoint[]): NormalizedPoint[] {
  return rawPoints
    .filter((point) => Number.isFinite(point.value))
    .map((point) => ({
      seriesKey: point.seriesKey.trim(),
      observedAt: point.observedAt,
      value: point.value,
      unit: point.unit,
      sourceKey
    }));
}
