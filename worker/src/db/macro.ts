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
  unit?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface FeedCheckInput {
  engineKey: string;
  feedKey: string;
  checkedAt: string;
  status: string;
  httpStatus?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
  details?: Record<string, unknown> | null;
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
  triggeredAt: string;
  details?: Record<string, unknown> | null;
}

export interface ActionLogInput {
  engineKey: string;
  decisionKey: string;
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
      unit,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (engine_key, feed_key, series_key, release_key, as_of_date)
    DO UPDATE SET
      observed_at = excluded.observed_at,
      value = excluded.value,
      revised_value = excluded.revised_value,
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
      checked_at,
      status,
      http_status,
      latency_ms,
      error_message,
      details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.feedKey,
      input.checkedAt,
      input.status,
      input.httpStatus ?? null,
      input.latencyMs ?? null,
      input.errorMessage ?? null,
      input.details ? JSON.stringify(input.details) : null
    )
    .run();
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
      triggered_at,
      details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.ruleKey,
      input.releaseKey,
      input.transitionKey,
      input.previousState ?? null,
      input.newState,
      input.triggeredAt,
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
      action_type,
      rationale,
      decided_at,
      details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.ruleKey ?? null,
      input.releaseKey ?? null,
      input.decisionKey,
      input.actionType,
      input.rationale ?? null,
      input.decidedAt,
      input.details ? JSON.stringify(input.details) : null
    )
    .run();
}

export async function insertRenderedOutput(env: Env, input: RenderedOutputInput): Promise<void> {
  await env.DB.prepare(
    `
    INSERT OR IGNORE INTO rendered_outputs (
      engine_key,
      output_key,
      release_key,
      markdown_body,
      content_json,
      rendered_at,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.engineKey,
      input.outputKey,
      input.releaseKey ?? null,
      input.markdownBody ?? null,
      input.content ? JSON.stringify(input.content) : null,
      input.renderedAt,
      input.metadata ? JSON.stringify(input.metadata) : null
    )
    .run();
}
