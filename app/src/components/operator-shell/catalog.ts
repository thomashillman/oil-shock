import type { MetricKey } from "./types";

export interface EngineInventory {
  engineKey: string;
  label: string;
}

export interface FeedInventory {
  feedKey: string;
  label: string;
  dimension: MetricKey;
  engineKey: string;
}

export const ENGINE_CATALOG: EngineInventory[] = [
  { engineKey: "oil_shock", label: "Oil Shock" },
];

export const FEED_CATALOG: FeedInventory[] = [
  { feedKey: "spot_wti", label: "WTI spot", dimension: "priceSignal", engineKey: "oil_shock" },
  { feedKey: "curve_slope", label: "Futures curve", dimension: "priceSignal", engineKey: "oil_shock" },
  { feedKey: "inventory_draw", label: "US crude stocks", dimension: "physicalStress", engineKey: "oil_shock" },
  { feedKey: "refinery_utilization", label: "Refinery utilization", dimension: "physicalStress", engineKey: "oil_shock" },
  { feedKey: "crack_spread", label: "Crack spread", dimension: "marketResponse", engineKey: "oil_shock" },
  { feedKey: "eu_pipeline_flow", label: "EU pipeline flow", dimension: "physicalStress", engineKey: "oil_shock" },
  { feedKey: "eu_gas_storage", label: "EU gas storage", dimension: "physicalStress", engineKey: "oil_shock" },
  { feedKey: "sec_impairment", label: "SEC impairment", dimension: "marketResponse", engineKey: "oil_shock" },
];
