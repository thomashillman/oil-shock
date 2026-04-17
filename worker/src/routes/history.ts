import type { Env } from "../env";
import { getSnapshotHistory } from "../db/client";
import { json } from "../lib/http";

export async function handleGetStateHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const parsed = parseInt(limitParam ?? "8", 10);
  const limit = Number.isNaN(parsed) ? 8 : Math.min(Math.max(parsed, 1), 30);

  const rows = await getSnapshotHistory(env, limit);

  const history = rows.map((row) => ({
    generatedAt: row.generated_at,
    mismatchScore: row.mismatch_score,
    dislocationState: JSON.parse(row.dislocation_state_json) as string,
  }));

  return json({ history });
}
