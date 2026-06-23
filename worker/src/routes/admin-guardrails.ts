import type { Env } from "../env";
import { getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";

export async function handleGuardrailFailures(env: Env): Promise<Response> {
  const snapshot = await getLatestSnapshot(env);
  if (!snapshot) {
    return json({ failures: [] });
  }
  return json({ failures: snapshot.guardrail_flags_json ? JSON.parse(snapshot.guardrail_flags_json) : [] });
}
