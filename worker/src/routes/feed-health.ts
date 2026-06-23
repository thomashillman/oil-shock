import type { Env } from "../env";
import { getFeedHealthSummary } from "../db/macro";
import { json } from "../lib/http";

export async function handleGetFeedHealth(env: Env): Promise<Response> {
  const feeds = await getFeedHealthSummary(env, "energy");

  return json({
    feeds: feeds.map((feed) => ({
      engineKey: feed.engineKey,
      feedKey: feed.feedKey,
      displayName: feed.displayName,
      enabled: feed.enabled,
      status: feed.status,
      latestCheck: feed.latestCheck
        ? {
            checkedAt: feed.latestCheck.checkedAt,
            step: feed.latestCheck.step,
            result: feed.latestCheck.result,
            status: feed.latestCheck.status,
            errorMessage: feed.latestCheck.errorMessage,
            latencyMs: feed.latestCheck.latencyMs
          }
        : null
    }))
  });
}
