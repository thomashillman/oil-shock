import type { Env } from "../env";
import type { NormalizedPoint, ScoreEvidence, StateSnapshot, StateChangeEvent, DislocationState, ScoringThresholds } from "../types";
import { AppError } from "../lib/errors";
import { isRulePredicate, type RuleDefinition } from "../core/rules/engine";

export async function writeSeriesPoints(env: Env, points: NormalizedPoint[]): Promise<void> {
  for (const point of points) {
    await env.DB.prepare(
      `
      INSERT INTO series_points (series_key, observed_at, value, unit, source_key)
      VALUES (?, ?, ?, ?, ?)
      `
    )
      .bind(point.seriesKey, point.observedAt, point.value, point.unit, point.sourceKey)
      .run();
  }
}

export async function startRun(env: Env, runKey: string, runType: string): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO runs (run_key, run_type, status, started_at)
    VALUES (?, ?, 'running', ?)
    `
  )
    .bind(runKey, runType, new Date().toISOString())
    .run();
}

export async function finishRun(
  env: Env,
  runKey: string,
  status: "success" | "failed",
  details: Record<string, unknown>
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE runs
    SET status = ?, finished_at = ?, details_json = ?
    WHERE run_key = ?
    `
  )
    .bind(status, new Date().toISOString(), JSON.stringify(details), runKey)
    .run();
}

export async function getLatestSeriesValue(env: Env, seriesKey: string): Promise<NormalizedPoint | null> {
  const row = await env.DB.prepare(
    `
    SELECT series_key, observed_at, value, unit, source_key
    FROM series_points
    WHERE series_key = ?
    ORDER BY observed_at DESC
    LIMIT 1
    `
  )
    .bind(seriesKey)
    .first<{
      series_key: string;
      observed_at: string;
      value: number;
      unit: string;
      source_key: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    seriesKey: row.series_key,
    observedAt: row.observed_at,
    value: row.value,
    unit: row.unit,
    sourceKey: row.source_key
  };
}


function isScoreDualWriteEnabled(env: Env): boolean {
  const flag = env.ENABLE_SCORE_DUAL_WRITE;
  if (!flag) return false;
  const normalized = flag.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function writeScoreRecord(
  env: Env,
  snapshot: StateSnapshot,
  snapshotId: number,
  runKey: string | null
): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO scores (
      engine_key,
      feed_key,
      scored_at,
      score_value,
      confidence,
      flags_json,
      snapshot_id,
      run_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      "oil_shock",
      "oil_shock.mismatch_score",
      snapshot.generatedAt,
      snapshot.mismatchScore,
      snapshot.coverageConfidence,
      JSON.stringify({
        state: snapshot.dislocationState,
        actionabilityState: snapshot.actionabilityState,
        sourceFreshness: snapshot.sourceFreshness,
        guardrailFlags: snapshot.guardrailFlags
      }),
      snapshotId,
      runKey
    )
    .run();
}

export async function writeSnapshot(env: Env, snapshot: StateSnapshot, runKey: string | null = null): Promise<number> {
  const result = await env.DB.prepare(
    `
    INSERT INTO signal_snapshots (
      generated_at,
      mismatch_score,
      actionability_state,
      coverage_confidence,
      source_freshness_json,
      evidence_ids_json,
      dislocation_state_json,
      state_rationale,
      subscores_json,
      clocks_json,
      ledger_impact_json,
      guardrail_flags_json,
      run_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      snapshot.generatedAt,
      snapshot.mismatchScore,
      snapshot.actionabilityState,
      snapshot.coverageConfidence,
      JSON.stringify(snapshot.sourceFreshness),
      JSON.stringify(snapshot.evidenceIds),
      JSON.stringify(snapshot.dislocationState),
      snapshot.stateRationale,
      JSON.stringify(snapshot.subscores),
      JSON.stringify(snapshot.clocks),
      JSON.stringify(snapshot.ledgerImpact),
      JSON.stringify(snapshot.guardrailFlags),
      runKey
    )
    .run();

  const snapshotId = Number(result.meta.last_row_id ?? 0);

  if (isScoreDualWriteEnabled(env)) {
    await writeScoreRecord(env, snapshot, snapshotId, runKey);
  }

  return snapshotId;
}

export async function writeRunEvidence(env: Env, runKey: string, evidenceItems: ScoreEvidence[]): Promise<void> {
  for (const evidence of evidenceItems) {
    await env.DB.prepare(
      `
      INSERT INTO run_evidence (
        run_key,
        evidence_key,
        evidence_group,
        observed_at,
        contribution,
        evidence_classification,
        coverage_quality,
        evidence_group_label,
        details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        runKey,
        evidence.evidenceKey,
        evidence.evidenceGroup,
        evidence.observedAt,
        evidence.contribution,
        evidence.classification,
        evidence.coverage,
        evidence.evidenceGroupLabel,
        JSON.stringify(evidence.details)
      )
      .run();
  }
}

export async function getLatestSnapshot(env: Env) {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM signal_snapshots
    ORDER BY generated_at DESC
    LIMIT 1
    `
  ).first<{
    id: number;
    generated_at: string;
    mismatch_score: number;
    actionability_state: "none" | "watch" | "actionable";
    coverage_confidence: number;
    source_freshness_json: string;
    evidence_ids_json: string;
    dislocation_state_json: string;
    state_rationale: string;
    subscores_json: string;
    clocks_json: string;
    ledger_impact_json: string | null;
    guardrail_flags_json: string | null;
    run_key: string | null;
  }>();
  return row ?? null;
}

async function getLatestScoreRunKey(env: Env): Promise<string | null> {
  const run = await env.DB.prepare(
    `
    SELECT run_key
    FROM runs
    WHERE run_type = 'score'
    ORDER BY started_at DESC
    LIMIT 1
    `
  ).first<{ run_key: string }>();
  return run?.run_key ?? null;
}

export async function getRunEvidenceBySnapshotRunKey(env: Env, snapshotRunKey: string | null) {
  const runKey = snapshotRunKey ?? (await getLatestScoreRunKey(env));
  if (!runKey) return [];

  const result = await env.DB.prepare(
    `
    SELECT evidence_key, evidence_group, observed_at, contribution, evidence_classification, coverage_quality, evidence_group_label, details_json
    FROM run_evidence
    WHERE run_key = ?
    ORDER BY observed_at DESC
    `
  )
    .bind(runKey)
    .all<{
      evidence_key: string;
      evidence_group: string;
      observed_at: string;
      contribution: number;
      evidence_classification: string;
      coverage_quality: string;
      evidence_group_label: string;
      details_json: string;
    }>();

  return result.results;
}

export async function getSnapshotHistory(
  env: Env,
  limit: number
): Promise<{ generated_at: string; mismatch_score: number; dislocation_state_json: string }[]> {
  const result = await env.DB.prepare(
    `
    SELECT generated_at, mismatch_score, dislocation_state_json
    FROM signal_snapshots
    ORDER BY generated_at DESC
    LIMIT ?
    `
  )
    .bind(limit)
    .all<{ generated_at: string; mismatch_score: number; dislocation_state_json: string }>();
  return result.results;
}

export async function getLatestStateChangeEvent(env: Env): Promise<{
  generated_at: string;
  previous_state: DislocationState | null;
  new_state: DislocationState;
  state_transition_duration_seconds: number | null;
  transmission_pressure_changed: boolean;
} | null> {
  const row = await env.DB.prepare(
    `
    SELECT generated_at, previous_state, new_state, state_transition_duration_seconds, transmission_pressure_changed
    FROM state_change_events
    ORDER BY generated_at DESC
    LIMIT 1
    `
  ).first<{
    generated_at: string;
    previous_state: string | null;
    new_state: string;
    state_transition_duration_seconds: number | null;
    transmission_pressure_changed: boolean;
  }>();

  if (!row) {
    return null;
  }

  return {
    generated_at: row.generated_at,
    previous_state: row.previous_state as DislocationState | null,
    new_state: row.new_state as DislocationState,
    state_transition_duration_seconds: row.state_transition_duration_seconds,
    transmission_pressure_changed: row.transmission_pressure_changed
  };
}

export async function writeSateChangeEvent(
  env: Env,
  event: {
    generatedAt: string;
    previousState: DislocationState | null;
    newState: DislocationState;
    stateDurationSeconds: number | null;
    transmissionChanged: boolean;
  }
): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO state_change_events (
      generated_at,
      previous_state,
      new_state,
      state_transition_duration_seconds,
      transmission_pressure_changed
    )
    VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      event.generatedAt,
      event.previousState,
      event.newState,
      event.stateDurationSeconds,
      event.transmissionChanged ? 1 : 0
    )
    .run();
}

export async function getFirstNonAlignedStateEvent(env: Env): Promise<{ generated_at: string } | null> {
  const row = await env.DB.prepare(
    `
    SELECT generated_at
    FROM state_change_events
    WHERE new_state != 'aligned'
    ORDER BY generated_at ASC
    LIMIT 1
    `
  ).first<{ generated_at: string }>();
  return row ?? null;
}

export async function getFirstTransmissionEvent(env: Env): Promise<{ generated_at: string } | null> {
  const row = await env.DB.prepare(
    `
    SELECT generated_at
    FROM state_change_events
    WHERE transmission_pressure_changed = 1
    ORDER BY generated_at ASC
    LIMIT 1
    `
  ).first<{ generated_at: string }>();
  return row ?? null;
}

export async function loadThresholds(env: Env): Promise<ScoringThresholds> {
  const result = await env.DB.prepare(
    `SELECT key, value FROM config_thresholds`
  ).all<{ key: string; value: unknown }>();

  const map = new Map<string, unknown>(result.results.map((r) => [r.key, r.value]));

  const required: Array<[keyof ScoringThresholds, string]> = [
    ["stateAlignedMax", "state_aligned_threshold_max"],
    ["stateMildMin", "state_mild_threshold_min"],
    ["stateMildMax", "state_mild_threshold_max"],
    ["statePersistentMin", "state_persistent_threshold_min"],
    ["statePersistentMax", "state_persistent_threshold_max"],
    ["stateDeepMin", "state_deep_threshold_min"],
    ["shockAgeThresholdHours", "shock_age_threshold_hours"],
    ["dislocationPersistenceHours", "dislocation_persistence_threshold_hours"],
    ["ledgerAdjustmentMagnitude", "ledger_adjustment_magnitude"],
    ["mismatchMarketResponseWeight", "mismatch_market_response_weight"],
    ["confirmationPhysicalStressMin", "confirmation_physical_stress_min"],
    ["confirmationPriceSignalMax", "confirmation_price_signal_max"],
    ["confirmationMarketResponseMin", "confirmation_market_response_min"],
    ["coverageMissingPenalty", "coverage_missing_penalty"],
    ["coverageStalePenalty", "coverage_stale_penalty"],
    ["coverageMaxPenalty", "coverage_max_penalty"],
    ["stateDeepPersistenceHours", "state_deep_persistence_hours"],
    ["statePersistentPersistenceHours", "state_persistent_persistence_hours"],
    ["ledgerStaleThresholdDays", "ledger_stale_threshold_days"]
  ];

  const thresholds = {} as ScoringThresholds;
  for (const [field, key] of required) {
    const value = map.get(key);
    if (value === undefined) {
      throw new AppError(`Missing config_thresholds key: ${key}`, 500, "MISSING_THRESHOLD");
    }
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new AppError(`Invalid config_thresholds value for key: ${key}`, 500, "INVALID_THRESHOLD");
    }
    thresholds[field] = numericValue;
  }

  return thresholds;
}

export async function getLedgerEntries(env: Env): Promise<
  {
    entryKey: string;
    impactDirection: "increase" | "decrease";
    createdAt: string;
    retiredAt: string | null;
    reviewDueAt: string;
  }[]
> {
  const result = await env.DB.prepare(
    `
    SELECT entry_key, impact_direction, created_at, retired_at, review_due_at
    FROM impairment_ledger
    ORDER BY created_at DESC
    `
  ).all<{
    entry_key: string;
    impact_direction: string;
    created_at: string;
    retired_at: string | null;
    review_due_at: string;
  }>();

  return result.results.map((row) => ({
    entryKey: row.entry_key,
    impactDirection: row.impact_direction as "increase" | "decrease",
    createdAt: row.created_at,
    retiredAt: row.retired_at,
    reviewDueAt: row.review_due_at
  }));
}

interface RuleRow {
  id: number;
  engine_key: string;
  rule_key: string;
  name: string;
  predicate_json: string;
  weight: number | null;
  action: string;
}

function normalizeRule(row: RuleRow): RuleDefinition {
  let predicate: unknown;
  try {
    predicate = JSON.parse(row.predicate_json);
  } catch {
    throw new AppError(`Invalid predicate_json for rule: ${row.rule_key}`, 500, "INVALID_RULE");
  }
  if (!isRulePredicate(predicate)) {
    throw new AppError(`Unsupported predicate for rule: ${row.rule_key}`, 500, "INVALID_RULE");
  }
  if (row.action !== "adjust_mismatch") {
    throw new AppError(`Unsupported action for rule: ${row.rule_key}`, 500, "INVALID_RULE");
  }

  return {
    id: row.id,
    engineKey: row.engine_key,
    ruleKey: row.rule_key,
    name: row.name,
    action: row.action as RuleDefinition["action"],
    weight: Number(row.weight ?? 0),
    predicate
  };
}

export async function listActiveRules(env: Env, engineKey = "oil_shock"): Promise<RuleDefinition[]> {
  const rows = await env.DB.prepare(
    `
    SELECT id, engine_key, rule_key, name, predicate_json, weight, action
    FROM rules
    WHERE engine_key = ? AND is_active = 1
    ORDER BY id ASC
    `
  )
    .bind(engineKey)
    .all<RuleRow>();
  return rows.results.map(normalizeRule);
}

export async function updateRuleByKey(
  env: Env,
  ruleKey: string,
  updates: { weight?: number; predicateJson?: string; isActive?: boolean }
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE rules
    SET
      weight = COALESCE(?, weight),
      predicate_json = COALESCE(?, predicate_json),
      is_active = COALESCE(?, is_active)
    WHERE engine_key = 'oil_shock' AND rule_key = ?
    `
  )
    .bind(
      updates.weight ?? null,
      updates.predicateJson ?? null,
      typeof updates.isActive === "boolean" ? (updates.isActive ? 1 : 0) : null,
      ruleKey
    )
    .run();
}
