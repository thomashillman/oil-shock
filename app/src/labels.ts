export const DISLOCATION_STATE_LABEL = {
  aligned: "Aligned",
  mild_divergence: "Mild divergence",
  persistent_divergence: "Persistent divergence",
  deep_divergence: "Deep divergence",
} as const;

export const DISLOCATION_STATE_DESCRIPTION = {
  aligned: "Physical conditions and market pricing are in sync.",
  mild_divergence: "Physical pressure emerging; market beginning to respond.",
  persistent_divergence: "Physical deterioration persists while market recognition lags; sustained mismatch.",
  deep_divergence: "Severe physical-market gap with multiple confirmations. Significant dislocation.",
} as const;

export const STATE_TAGLINE = {
  none: "Physical energy supply and market pricing appear aligned.",
  watch: "Physical constraints may be outpacing what markets have priced in.",
  actionable: "Physical constraints are significantly ahead of market pricing — a potential dislocation.",
} as const;

export const STATE_SUBTITLE = {
  none: "No significant dislocation signal.",
  watch: "Signal present. Monitoring for confirmation.",
  actionable: "Signal confirmed across multiple data sources.",
} as const;

export const FRESHNESS_LABEL = {
  physicalStress: "Physical data",
  priceSignal: "Price data",
  marketResponse: "Market data",
} as const;

export const CLASSIFICATION_LABEL = {
  confirming: "Confirming",
  counterevidence: "Counterevidence",
  falsifier: "Falsifier",
} as const;

export const COVERAGE_LABEL = {
  well: "Well covered",
  weakly: "Weakly covered",
  not_covered: "Not covered",
} as const;

export const GROUP_META: Record<string, { label: string; description: string }> = {
  physical: {
    label: "Physical Reality",
    description: "EIA inventory draws and refinery utilisation — actual supply conditions.",
  },
  physical_reality: {
    label: "Physical Reality",
    description: "EIA inventory draws and refinery utilisation — actual supply conditions.",
  },
  recognition: {
    label: "Market Recognition",
    description: "Spot price behaviour and curve positioning — how market is pricing the situation.",
  },
  market_recognition: {
    label: "Market Recognition",
    description: "Spot price behaviour and curve positioning — how market is pricing the situation.",
  },
  transmission: {
    label: "Transmission Pressure",
    description: "Crack spreads and SEC filings — whether physical stress is flowing into company earnings.",
  },
  transmission_pressure: {
    label: "Transmission Pressure",
    description: "Crack spreads and SEC filings — whether physical stress is flowing into company earnings.",
  },
};

/**
 * Presentation metadata for the Observations panel.
 *
 * The runtime API supplies the structural facts per observation (displayName,
 * provider, unit, dimension). The editorial copy below — what each category
 * measures and what a *high* reading indicates — does not live in the data
 * layer, so it is defined here alongside the other UI label tables.
 *
 * All observation values are normalized 0–1 (rendered 0–100%) where a higher
 * reading means more physical/market stress contributing to the score.
 */
export type ObservationDimension =
  | "physical_stress"
  | "energy_spread"
  | "price_signal"
  | "other";

export const OBSERVATION_CATEGORY_META: Record<
  ObservationDimension,
  { label: string; description: string; order: number }
> = {
  physical_stress: {
    label: "Physical Stress",
    description: "Actual supply conditions — refinery runs, crude draws, EU gas storage.",
    order: 0,
  },
  energy_spread: {
    label: "Energy Spreads",
    description: "Crude and product spreads — where pricing stress shows up first.",
    order: 1,
  },
  price_signal: {
    label: "Price Signal",
    description: "Futures-curve shape — how the market is positioned.",
    order: 2,
  },
  other: {
    label: "Other Signals",
    description: "Additional normalized inputs.",
    order: 3,
  },
};

export function categoryMeta(dimension: string): {
  label: string;
  description: string;
  order: number;
} {
  return (
    OBSERVATION_CATEGORY_META[dimension as ObservationDimension] ??
    OBSERVATION_CATEGORY_META.other
  );
}

// Per-series "what a high reading indicates". Keyed by seriesKey.
export const OBSERVATION_METRIC_META: Record<string, { meaning: string }> = {
  "physical_stress.refinery_utilization": {
    meaning: "High = refineries running below normal, tightening product supply.",
  },
  "physical_stress.inventory_draw": {
    meaning: "High = crude inventories drawing down faster than usual.",
  },
  "physical_stress.eu_gas_storage": {
    meaning: "High = EU gas storage under stress (low fill or rapid draw).",
  },
  "energy_spread.wti_brent_spread": {
    meaning: "High = WTI–Brent spread widening, a sign of regional crude dislocation.",
  },
  "energy_spread.diesel_wti_crack": {
    meaning: "High = diesel crack spread widening, refining stress feeding through.",
  },
  "price_signal.curve_slope": {
    meaning: "High = futures curve shape consistent with tighter expected supply.",
  },
};

export function metricMeaning(seriesKey: string): string {
  return (
    OBSERVATION_METRIC_META[seriesKey]?.meaning ??
    "Higher readings indicate more stress contributing to the score."
  );
}

export type ObservationLevel = "calm" | "elevated" | "high";

// Same 0.33 / 0.66 breakpoints used by the score gauge and statusLabel().
export function observationLevel(value: number): ObservationLevel {
  if (value >= 0.66) return "high";
  if (value >= 0.33) return "elevated";
  return "calm";
}

export const OBSERVATION_LEVEL_LABEL: Record<ObservationLevel, string> = {
  calm: "Calm",
  elevated: "Elevated",
  high: "High stress",
};

export const EVIDENCE_KEY_LABEL: Record<string, string> = {
  "physical-pressure": "Physical Supply Pressure",
  "recognition-gap": "Market Recognition Gap",
  "transmission-stress": "Transmission Stress",
};

export function evidenceLabel(key: string): string {
  return EVIDENCE_KEY_LABEL[key] ?? key;
}

export function groupMeta(group: string): { label: string; description: string } {
  return GROUP_META[group] ?? { label: group, description: "" };
}

export function classificationLabel(classification: string): string {
  return CLASSIFICATION_LABEL[classification as keyof typeof CLASSIFICATION_LABEL] ?? classification;
}

export function coverageLabel(coverage: string): string {
  return COVERAGE_LABEL[coverage as keyof typeof COVERAGE_LABEL] ?? coverage;
}
