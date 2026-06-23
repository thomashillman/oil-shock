import type { Env } from "../env";
import { getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";
import { parseSnapshotFreshness } from "../core/freshness/summary";

function deriveFailures(snapshot: NonNullable<Awaited<ReturnType<typeof getLatestSnapshot>>>) {
  const freshness = parseSnapshotFreshness(snapshot.source_freshness_json);
  const guardrailFlags = snapshot.guardrail_flags_json ? (JSON.parse(snapshot.guardrail_flags_json) as string[]) : [];
  if (guardrailFlags.length > 0) {
    return guardrailFlags.map((flag) => `Guardrail flagged ${flag}.`);
  }

  return [
    freshness.physicalStress !== "fresh"
      ? "Physical signal is not fresh."
      : null,
    freshness.priceSignal !== "fresh"
      ? "Price signal is not fresh."
      : null,
    freshness.marketResponse !== "fresh"
      ? "Market response is not fresh."
      : null
  ].filter((item): item is string => item !== null);
}

export async function handleGuardrailFailures(env: Env): Promise<Response> {
  const snapshot = await getLatestSnapshot(env);
  if (!snapshot) {
    return json({ failures: [] });
  }

  return json({ failures: deriveFailures(snapshot) });
}
