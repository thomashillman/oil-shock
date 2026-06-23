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
