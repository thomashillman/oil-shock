import type { Env } from "../env";
import { getLatestRunByType, getRunByKey } from "../db/client";
import { json } from "../lib/http";

function parseDetails(detailsJson: string | null): Record<string, unknown> {
  if (!detailsJson) return {};
  try {
    const parsed = JSON.parse(detailsJson) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleGetRunStatus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const runKey = url.searchParams.get("runKey");

  const run = runKey ? await getRunByKey(env, runKey) : await getLatestRunByType(env, "admin_recalc");

  if (!run) {
    return json(
      {
        error: "run_not_found",
        message: "No matching run was found."
      },
      { status: 404 }
    );
  }

  return json({
    runKey: run.run_key,
    runType: run.run_type,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    details: parseDetails(run.details_json)
  });
}
