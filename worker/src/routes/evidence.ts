import type { Env } from "../env";
import { getLatestRunEvidence, getLatestSnapshot } from "../db/client";
import { json } from "../lib/http";

export async function handleGetEvidence(env: Env): Promise<Response> {
  const snapshot = await getLatestSnapshot(env);
  if (!snapshot) {
    return json(
      {
        error: "no_snapshot",
        message: "No snapshot is available yet."
      },
      { status: 404 }
    );
  }

  const evidence = await getLatestRunEvidence(env);
  return json({
    generated_at: snapshot.generated_at,
    evidence
  });
}
