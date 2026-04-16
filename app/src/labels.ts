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
  physical: "Supply data",
  recognition: "Market data",
  transmission: "Spread data",
} as const;

export const GROUP_META: Record<string, { label: string; description: string }> = {
  physical: {
    label: "Supply Pressure",
    description: "EIA inventory draws and refinery utilisation — how tight physical supply is.",
  },
  recognition: {
    label: "Market Recognition Gap",
    description: "How far behind market pricing is relative to physical conditions.",
  },
  transmission: {
    label: "Price Transmission",
    description: "Crack spreads and SEC impairment filings — whether tightness is flowing into prices.",
  },
};

export const EVIDENCE_KEY_LABEL: Record<string, string> = {
  "physical-pressure": "Physical Supply Pressure",
  "recognition-gap": "Market Recognition Gap",
  "transmission-stress": "Spread & Filing Stress",
};

export function evidenceLabel(key: string): string {
  return EVIDENCE_KEY_LABEL[key] ?? key;
}

export function groupMeta(group: string): { label: string; description: string } {
  return GROUP_META[group] ?? { label: group, description: "" };
}
