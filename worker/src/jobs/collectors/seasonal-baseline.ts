/**
 * Seasonal-baseline helpers for physical-supply feeds.
 *
 * Crude inventory, refinery utilisation and EU gas storage all have a strong seasonal shape, so a
 * "low" reading is only meaningful relative to the same period in prior years. These pure helpers
 * turn raw historical observations into per-period baselines and decide whether the current
 * reading has breached (fallen below) its seasonal norm.
 *
 * All helpers operate on RAW physical levels (inventory Mbb, utilisation %, storage fullness %),
 * where a LOWER value means a tighter physical system. A breach is therefore "current reading is
 * below the seasonal baseline".
 */

export type SeasonalGranularity = "week" | "month";

export interface RawObservation {
  /** ISO date, "YYYY-MM-DD", or "YYYY-MM". */
  observedAt: string;
  /** Raw physical level (not the normalised stress ratio). */
  value: number;
}

export interface SeasonalBaseline {
  periodKey: string;
  baselineValue: number;
  sampleCount: number;
}

export interface SeasonalBreach {
  breached: boolean;
  currentPeriodKey: string | null;
  rollingValue: number | null;
  baselineValue: number | null;
  sampleCount: number;
}

function yearOf(observedAt: string): number | null {
  const match = /^(\d{4})/.exec(observedAt);
  return match ? Number(match[1]) : null;
}

function isoWeekNumber(date: Date): number {
  // ISO 8601 week number (Mon-based, week containing the year's first Thursday is week 1).
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Stable, granularity-dependent period key for an observation, or null if unparseable.
 *   week  -> "W01".."W53" (ISO week-of-year)
 *   month -> "M01".."M12" (month-of-year)
 */
export function periodKeyFor(observedAt: string, granularity: SeasonalGranularity): string | null {
  if (granularity === "month") {
    const match = /^\d{4}-(\d{2})/.exec(observedAt);
    if (!match) {
      return null;
    }
    return `M${match[1]}`;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(observedAt);
  if (!match) {
    return null;
  }
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `W${String(isoWeekNumber(date)).padStart(2, "0")}`;
}

export interface SeasonalBaselineOptions {
  /** Exclude observations from this calendar year (compare current reading vs PRIOR years). */
  excludeYear?: number;
}

/**
 * Average raw observations into a per-period seasonal baseline. Periods with no observations are
 * omitted. When `excludeYear` is provided, that year's observations are left out so the baseline
 * reflects prior-year norms rather than the period being judged.
 */
export function computeSeasonalBaselines(
  observations: RawObservation[],
  granularity: SeasonalGranularity,
  options: SeasonalBaselineOptions = {}
): SeasonalBaseline[] {
  const sums = new Map<string, { total: number; count: number }>();

  for (const obs of observations) {
    if (!Number.isFinite(obs.value)) {
      continue;
    }
    if (options.excludeYear !== undefined && yearOf(obs.observedAt) === options.excludeYear) {
      continue;
    }
    const periodKey = periodKeyFor(obs.observedAt, granularity);
    if (!periodKey) {
      continue;
    }
    const bucket = sums.get(periodKey) ?? { total: 0, count: 0 };
    bucket.total += obs.value;
    bucket.count += 1;
    sums.set(periodKey, bucket);
  }

  return [...sums.entries()]
    .map(([periodKey, { total, count }]) => ({
      periodKey,
      baselineValue: total / count,
      sampleCount: count
    }))
    .sort((left, right) => left.periodKey.localeCompare(right.periodKey));
}

function sortByObservedAt(observations: RawObservation[]): RawObservation[] {
  return [...observations].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

export interface SeasonalBreachOptions {
  granularity: SeasonalGranularity;
  /** Number of most-recent observations averaged into the current reading. */
  rollingCount: number;
}

/**
 * Decide whether the most-recent reading has breached its seasonal baseline. The current reading
 * is the average of the last `rollingCount` observations; it is compared against the baseline for
 * the latest observation's period. Missing data (no baseline for the current period, or no
 * observations) is conservatively reported as "not breached".
 */
export function evaluateSeasonalBreach(
  observations: RawObservation[],
  baselines: SeasonalBaseline[],
  options: SeasonalBreachOptions
): SeasonalBreach {
  const empty: SeasonalBreach = {
    breached: false,
    currentPeriodKey: null,
    rollingValue: null,
    baselineValue: null,
    sampleCount: 0
  };

  const sorted = sortByObservedAt(observations).filter((obs) => Number.isFinite(obs.value));
  const latest = sorted.at(-1);
  if (!latest) {
    return empty;
  }

  const currentPeriodKey = periodKeyFor(latest.observedAt, options.granularity);
  if (!currentPeriodKey) {
    return empty;
  }

  const window = sorted.slice(-Math.max(1, options.rollingCount));
  const rollingValue = window.reduce((sum, obs) => sum + obs.value, 0) / window.length;

  const baseline = baselines.find((entry) => entry.periodKey === currentPeriodKey) ?? null;
  if (!baseline) {
    return { breached: false, currentPeriodKey, rollingValue, baselineValue: null, sampleCount: 0 };
  }

  return {
    breached: rollingValue < baseline.baselineValue,
    currentPeriodKey,
    rollingValue,
    baselineValue: baseline.baselineValue,
    sampleCount: baseline.sampleCount
  };
}

/** Series-key suffix used for the derived per-feed breach flag written to series_points. */
export const SEASONAL_BREACH_SUFFIX = ".seasonal_breach";

export function seasonalBreachSeriesKey(feedKey: string): string {
  return `${feedKey}${SEASONAL_BREACH_SUFFIX}`;
}
