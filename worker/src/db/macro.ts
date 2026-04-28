import type { Env } from "../env";

export interface ObservationInput {
  engineKey: string;
  feedKey: string;
  seriesKey: string;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
  revisedValue?: number | null;
  latencyTag?: string | null;
  sourceHash?: string | null;
  r2ArtifactKey?: string | null;
  runKey?: string | null;
  unit?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface FeedCheckInput {
  engineKey: string;
  feedKey: string;
  checkedAt: string;
  status: string;
  runKey?: string | null;
  step?: string | null;
  result?: string | null;
  httpStatus?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
  details?: Record<string, unknown> | null;
}

export interface FeedRegistryRow {
  engineKey: string;
  feedKey: string;
  displayName: string | null;
  enabled: boolean;
}

export interface FeedCheckRow {
  engineKey: string;
  feedKey: string;
  checkedAt: string;
  step: string | null;
  result: string | null;
  status: string;
  errorMessage: string | null;
  latencyMs: number | null;
}

export interface FeedHealthRow extends FeedRegistryRow {
  status: "ok" | "error" | "unknown";
  latestCheck: FeedCheckRow | null;
}

export interface RuleStateInput {
  engineKey: string;
  ruleKey: string;
  stateKey: string;
  releaseKey?: string | null;
  state: Record<string, unknown>;
  evaluatedAt: string;
}

export interface TriggerEventInput {
  engineKey: string;
  ruleKey: string;
  releaseKey: string;
  transitionKey: string;
  previousState?: string | null;
  newState: string;
  status?: string;
  reason?: string | null;
  runKey?: string | null;
  triggeredAt: string;
  computed?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}

export interface ActionLogInput {
  engineKey: string;
  decisionKey: string;
  decision: "allowed" | "blocked" | "ignored" | "error";
  actionType: string;
  decidedAt: string;
  ruleKey?: string | null;
  releaseKey?: string | null;
  rationale?: string | null;
  details?: Record<string, unknown> | null;
}

export interface RenderedOutputInput {
  engineKey: string;
  outputKey: string;
  renderedAt: string;
  releaseKey?: string | null;
  outputIdempotencyKey?: string;
  markdownBody?: string | null;
  content?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export async function upsertObservation(env: Env, input: ObservationInput): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO observations (
      engine_key,
      feed_key,
      series_key,
      release_key,
      as_of_date,
      observed_at,
      value,
      revised_value,
      latency_tag,
      source_hash,
      r2_artifact_key,
      run_key,
      unit,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (engine_key, feed_key, series_key, release_key, as_of_date)
    DO UPDATE SET
      observed_at = excluded.observed_at,
      value = excluded.value,
      revised_value = excluded.revised_value,
      latency_tag = excluded.latency_tag,
      source_hash = excluded.source_hash,
      r2_artifact_key = excluded.r2_artifact_key,
      run_key = excluded.run_key,
      unit = excluded.unit,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
    `
  )
    .bind(
      input.engineKey,
      input.feedKey,
      input.seriesKey,
      input.releaseKey,
      input.asOfDate,
      input.observedAt,
      input.value,
      input.revisedValue ?? null,
      input.latencyTag ?? null,
      input.sourceHash ?? null,
      input.r2ArtifactKey ?? null,
      input.runKey ?? null,
      input.unit ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    )
    .run();
}

export async function getLatestObservation(
  env: Env,
  engineKey: string,
  feedKey: string,
  seriesKey: string
): Promise<ObservationInput | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      engine_key,
      feed_key,
      series_key,
      release_key,
      as_of_date,
      observed_at,
      value,
      revised_value,
      latency_tag,
      source_hash,
      r2_artifact_key,
      run_key,
      unit,
      metadata_json
    FROM observations
    WHERE engine_key = ?
      AND feed_key = ?
      AND series_key = ?
    ORDER BY as_of_date DESC, observed_at DESC
    LIMIT 1
    `
  )
    .bind(engineKey, feedKey, seriesKey)
    .first<{
      engine_key: string;
      feed_key: string;
      series_key: string;
      release_key: string;
      as_of_date: string;
      observed_at: string;
      value: number;
      revised_value: number | null;
      latency_tag: string | null;
      source_hash: string | null;
      r2_artifact_key: string | null;
      run_key: string | null;
      unit: string | null;
      metadata_json: string | null;
    }>();

  if (!row) {
    return null;
  }

  return {
    engineKey: row.engine_key,
    feedKey: row.feed_key,
    seriesKey: row.series_key,
    releaseKey: row.release_key,
    asOfDate: row.as_of_date,
    observedAt: row.observed_at,
    value: row.value,
    revisedValue: row.revised_value,
    latencyTag: row.latency_tag,
    sourceHash: row.source_hash,
    r2ArtifactKey: row.r2_artifact_key,
    runKey: row.run_key,
    unit: row.unit,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null
  };
}

export async function recordFeedCheck(env: Env, input: FeedCheckInput): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO feed_checks (
      engine_key,
      feed_key,
      run_key,
      step,
      result,
      checked_at,
      status,
      http_status,
      latency_ms,
      error_message,
      details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.feedKey,
      input.runKey ?? null,
      input.step ?? null,
      input.result ?? null,
      input.checkedAt,
      input.status,
      input.httpStatus ?? null,
      input.latencyMs ?? null,
      input.errorMessage ?? null,
      input.details ? JSON.stringify(input.details) : null
    )
    .run();
}

export async function listRegisteredFeeds(env: Env, engineKey: string): Promise<FeedRegistryRow[]> {
  const result = await env.DB.prepare(
    `
    SELECT engine_key, feed_key, display_name, enabled
    FROM feed_registry
    WHERE engine_key = ?
    ORDER BY feed_key
    `
  )
    .bind(engineKey)
    .all<{
      engine_key: string;
      feed_key: string;
      display_name: string | null;
      enabled: number;
    }>();

  return result.results.map((row) => ({
    engineKey: row.engine_key,
    feedKey: row.feed_key,
    displayName: row.display_name,
    enabled: row.enabled === 1
  }));
}

export async function listEnabledFeedKeys(env: Env, engineKey: string): Promise<string[]> {
  const result = await env.DB.prepare(
    `
    SELECT feed_key
    FROM feed_registry
    WHERE engine_key = ?
      AND enabled = 1
    ORDER BY feed_key
    `
  )
    .bind(engineKey)
    .all<{ feed_key: string }>();

  return result.results.map((row) => row.feed_key);
}

export async function getLatestFeedChecks(env: Env, engineKey: string): Promise<FeedCheckRow[]> {
  const result = await env.DB.prepare(
    `
    SELECT engine_key, feed_key, checked_at, step, result, status, error_message, latency_ms
    FROM feed_checks
    WHERE engine_key = ?
    ORDER BY checked_at DESC
    `
  )
    .bind(engineKey)
    .all<{
      engine_key: string;
      feed_key: string;
      checked_at: string;
      step: string | null;
      result: string | null;
      status: string;
      error_message: string | null;
      latency_ms: number | null;
    }>();

  const latestByFeed = new Map<string, FeedCheckRow>();
  for (const row of result.results) {
    if (latestByFeed.has(row.feed_key)) {
      continue;
    }
    latestByFeed.set(row.feed_key, {
      engineKey: row.engine_key,
      feedKey: row.feed_key,
      checkedAt: row.checked_at,
      step: row.step,
      result: row.result,
      status: row.status,
      errorMessage: row.error_message,
      latencyMs: row.latency_ms
    });
  }

  return [...latestByFeed.values()];
}

export async function getFeedHealthSummary(env: Env, engineKey: string): Promise<FeedHealthRow[]> {
  const [feeds, checks] = await Promise.all([
    listRegisteredFeeds(env, engineKey),
    getLatestFeedChecks(env, engineKey)
  ]);
  const checksByFeedKey = new Map(checks.map((check) => [check.feedKey, check] as const));

  return feeds.map((feed) => {
    const latestCheck = checksByFeedKey.get(feed.feedKey) ?? null;
    const status = latestCheck ? (latestCheck.status === "ok" ? "ok" : "error") : "unknown";
    return {
      ...feed,
      status,
      latestCheck
    };
  });
}

export async function upsertRuleState(env: Env, input: RuleStateInput): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO rule_state (
      engine_key,
      rule_key,
      state_key,
      release_key,
      state_json,
      evaluated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (engine_key, rule_key, state_key)
    DO UPDATE SET
      release_key = excluded.release_key,
      state_json = excluded.state_json,
      evaluated_at = excluded.evaluated_at,
      updated_at = CURRENT_TIMESTAMP
    `
  )
    .bind(
      input.engineKey,
      input.ruleKey,
      input.stateKey,
      input.releaseKey ?? null,
      JSON.stringify(input.state),
      input.evaluatedAt
    )
    .run();
}

export async function insertTriggerEvent(env: Env, input: TriggerEventInput): Promise<void> {
  await env.DB.prepare(
    `
    INSERT OR IGNORE INTO trigger_events (
      engine_key,
      rule_key,
      release_key,
      transition_key,
      previous_state,
      new_state,
      status,
      reason,
      run_key,
      triggered_at,
      computed_json,
      details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.ruleKey,
      input.releaseKey,
      input.transitionKey,
      input.previousState ?? null,
      input.newState,
      input.status ?? "confirmed",
      input.reason ?? null,
      input.runKey ?? null,
      input.triggeredAt,
      input.computed ? JSON.stringify(input.computed) : null,
      input.details ? JSON.stringify(input.details) : null
    )
    .run();
}

export async function insertActionLog(env: Env, input: ActionLogInput): Promise<void> {
  await env.DB.prepare(
    `
    INSERT OR IGNORE INTO action_log (
      engine_key,
      rule_key,
      release_key,
      decision_key,
      decision,
      action_type,
      rationale,
      decided_at,
      details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.ruleKey ?? null,
      input.releaseKey ?? null,
      input.decisionKey,
      input.decision,
      input.actionType,
      input.rationale ?? null,
      input.decidedAt,
      input.details ? JSON.stringify(input.details) : null
    )
    .run();
}

export async function insertRenderedOutput(env: Env, input: RenderedOutputInput): Promise<void> {
  const idempotencyKey = input.outputIdempotencyKey ?? `${input.outputKey}:${input.releaseKey ?? ""}:${input.renderedAt}`;

  await env.DB.prepare(
    `
    INSERT OR IGNORE INTO rendered_outputs (
      engine_key,
      output_key,
      output_idempotency_key,
      release_key,
      markdown_body,
      content_json,
      rendered_at,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.outputKey,
      idempotencyKey,
      input.releaseKey ?? null,
      input.markdownBody ?? null,
      input.content ? JSON.stringify(input.content) : null,
      input.renderedAt,
      input.metadata ? JSON.stringify(input.metadata) : null
    )
    .run();
}
