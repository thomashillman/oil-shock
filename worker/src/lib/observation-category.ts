/**
 * Map an observation feed/series key to its signal category ("dimension").
 *
 * Observation keys are namespaced by family, e.g. `physical_stress.eu_gas_storage`,
 * `energy_spread.diesel_wti_crack`, `price_signal.curve_slope`. The category is the
 * prefix before the first dot. This is the canonical grouping the runtime API exposes
 * so the frontend does not have to re-derive it from raw keys.
 */
export type ObservationCategory = "physical_stress" | "energy_spread" | "price_signal" | "other";

const KNOWN_CATEGORIES: ReadonlySet<ObservationCategory> = new Set([
  "physical_stress",
  "energy_spread",
  "price_signal"
]);

export function categoryForFeedKey(feedKey: string): ObservationCategory {
  const prefix = feedKey.split(".", 1)[0]?.trim() ?? "";
  return KNOWN_CATEGORIES.has(prefix as ObservationCategory) ? (prefix as ObservationCategory) : "other";
}
