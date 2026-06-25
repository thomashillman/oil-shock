import type { Env } from "../env";
import { AppError } from "../lib/errors";
import { isRulePredicate, type RuleDefinition, type RulePredicate } from "../core/rules/engine";
import type { NormalizedPoint, ScoreEvidence, ScoringThresholds, StateSnapshot } from "../types";

export interface SnapshotRow {
  id: number;
  generated_at: string;
  mismatch_score: number;
  actionability_state: "none" | "watch" | "actionable";
  coverage_confidence: number;
  source_freshness_json: string;
  evidence_ids_json: string;
  dislocation_state_json: string;
  state_rationale: string | null;
  subscores_json: string;
  clocks_json: string;
  ledger_impact_json: string | null;
  guardrail_flags_json: string | null;
  run_key: string;
}

export interface RunEvidenceRow {
  evidence_key: string;
  evidence_group: string;
  evidence_group_label: string;
  observed_at: string;
  contribution: number;
  details_json: string;
  evidence_classification: string;
  coverage_quality: string;
}

export interface RuleRow {
  id: number;
  engine_key: string;
  rule_key: string;
  name: string;
  predicate_json: string;
  weight: number;
  action: "adjust_mismatch";
  is_active: number;
}

export interface ScoreRow {
  engine_key: string;
  feed_key: string;
  scored_at: string;
  score_value: number;
  confidence: number | null;
  flags_json: string | null;
  run_key: string | null;
}

export interface LedgerEntryRow {
  entry_key: string;
  rationale: string;
  impact_direction: "increase" | "decrease";
  review_due_at: string;
  retired_at: string | null;
  created_at: string;
}

export interface StateChangeEventRow {
  generated_at: string;
  previous_state: string | null;
  new_state: string;
  state_transition_duration_seconds: number | null;
  transmission_pressure_changed: number;
}

export interface ThresholdRow {
  key: string;
  value: number;
}

export interface PreDeployGateRow {
  flag_name: string;
  gate_name: string;
  status: "PENDING" | "SIGNED_OFF" | "EXPIRED";
  signed_off_by: string | null;
  signed_off_at: string | null;
  expires_at: string | null;
  notes: string | null;
  last_validated_at: string | null;
  validation_result: string | null;
}

export interface GateSignOffHistoryRow {
  signed_off_by: string;
  signed_off_at: string;
  expires_at: string;
  notes: string | null;
}

export interface RuleMutationInput {
  name?: string;
  predicateJson?: string;
  weight?: number;
  isActive?: boolean;
}

export interface CreateRuleInput {
  engineKey: string;
  ruleKey: string;
  name: string;
  predicateJson: string;
  weight: number;
  isActive: boolean;
}

export interface EngineScoreInput {
  engineKey: string;
  feedKey: string;
  scoredAt: string;
  scoreValue: number;
  confidence: number;
  flags: string[] | Record<string, unknown>;
  runKey?: string | null;
}

function parseJsonOrNull<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  return JSON.parse(value) as T;
}

function mapRuleRow(row: {
  id: number;
  engine_key: string;
  rule_key: string;
  name: string;
  predicate_json: string;
  weight: number;
  action: string;
  is_active: number;
}): RuleDefinition {
  const parsedPredicate = JSON.parse(row.predicate_json) as unknown;
  if (!isRulePredicate(parsedPredicate)) {
    throw new Error(`Invalid rule predicate for ${row.engine_key}/${row.rule_key}`);
  }

  return {
    id: row.id,
    engineKey: row.engine_key,
    ruleKey: row.rule_key,
    name: row.name,
    predicate: parsedPredicate,
    weight: row.weight,
    action: row.action as "adjust_mismatch"
  };
}

const THRESHOLD_KEY_MAP: Array<[keyof ScoringThresholds, string]> = [
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
  ["ledgerStaleThresholdDays", "ledger_stale_threshold_days"],
  ["wtiBrentFloorUsd", "wti_brent_floor_usd"],
  ["wtiBrentCeilingUsd", "wti_brent_ceiling_usd"],
  ["wtiPremiumDiscount", "wti_premium_discount"],
  ["dieselCrackFloorUsd", "diesel_crack_floor_usd"],
  ["dieselCrackCeilingUsd", "diesel_crack_ceiling_usd"],
  ["physicalBaselinePenaltyWeight", "physical_baseline_penalty_weight"],
  ["seasonalBaselineYears", "seasonal_baseline_years"],
  ["physicalRollingWeeks", "physical_rolling_weeks"]
];

export async function writeSeriesPoints(env: Env, points: NormalizedPoint[]): Promise<void> {
  for (const point of points) {
    await env.DB.prepare(
      `
      INSERT INTO series_points (series_key, observed_at, value, unit, source_key)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(series_key, observed_at, source_key)
      DO UPDATE SET
        value = excluded.value,
        unit = excluded.unit
      `
    )
      .bind(point.seriesKey, point.observedAt, point.value, point.unit, point.sourceKey)
      .run();
  }
}

export interface SeasonalBaselineRecord {
  periodKey: string;
  baselineValue: number;
  sampleCount: number;
}

/** Idempotently upsert per-period seasonal baselines for a physical feed. */
export async function writeSeasonalBaselines(
  env: Env,
  feedKey: string,
  baselines: SeasonalBaselineRecord[]
): Promise<void> {
  const updatedAt = new Date().toISOString();
  for (const baseline of baselines) {
    await env.DB.prepare(
      `
      INSERT INTO seasonal_baselines (feed_key, period_key, baseline_value, sample_count, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(feed_key, period_key)
      DO UPDATE SET
        baseline_value = excluded.baseline_value,
        sample_count = excluded.sample_count,
        updated_at = excluded.updated_at
      `
    )
      .bind(feedKey, baseline.periodKey, baseline.baselineValue, baseline.sampleCount, updatedAt)
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

export async function writeSnapshot(env: Env, snapshot: StateSnapshot, runKey?: string | null): Promise<number> {
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
      snapshot.ledgerImpact ? JSON.stringify(snapshot.ledgerImpact) : null,
      JSON.stringify(snapshot.guardrailFlags),
      runKey ?? null
    )
    .run();

  return Number(result.meta.last_row_id ?? 0);
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
        details_json,
        evidence_classification,
        coverage_quality,
        evidence_group_label
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
        JSON.stringify(evidence.details),
        evidence.classification,
        evidence.coverage,
        evidence.evidenceGroupLabel
      )
      .run();
  }
}

export async function getLatestSnapshot(env: Env): Promise<SnapshotRow | null> {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM signal_snapshots
    ORDER BY generated_at DESC
    LIMIT 1
    `
  ).first<SnapshotRow>();
  return row ?? null;
}

export async function getLatestRunEvidence(env: Env): Promise<RunEvidenceRow[]> {
  const run = await env.DB.prepare(
    `
    SELECT run_key
    FROM runs
    WHERE run_type = 'score'
    ORDER BY started_at DESC
    LIMIT 1
    `
  ).first<{ run_key: string }>();

  if (!run) {
    return [];
  }

  return getRunEvidenceBySnapshotRunKey(env, run.run_key);
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

export async function getRunEvidenceBySnapshotRunKey(
  env: Env,
  runKey: string | null
): Promise<RunEvidenceRow[]> {
  const effectiveRunKey = runKey ?? (await getLatestScoreRunKey(env));
  if (!effectiveRunKey) {
    return [];
  }

  const result = await env.DB.prepare(
    `
    SELECT
      evidence_key,
      evidence_group,
      observed_at,
      contribution,
      details_json,
      evidence_classification,
      coverage_quality,
      evidence_group_label
    FROM run_evidence
    WHERE run_key = ?
    ORDER BY observed_at DESC, evidence_key ASC
    `
  )
    .bind(effectiveRunKey)
    .all<{
      evidence_key: string;
      evidence_group: string;
      observed_at: string;
      contribution: number;
      details_json: string;
      evidence_classification: string;
      coverage_quality: string;
      evidence_group_label: string;
    }>();

  return result.results;
}

export async function getSnapshotHistory(
  env: Env,
  limit: number
): Promise<Array<Pick<SnapshotRow, "generated_at" | "mismatch_score" | "dislocation_state_json" | "guardrail_flags_json">>> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 30);
  const result = await env.DB.prepare(
    `
    SELECT
      generated_at,
      mismatch_score,
      dislocation_state_json,
      guardrail_flags_json
    FROM signal_snapshots
    ORDER BY generated_at DESC
    LIMIT ?
    `
  )
    .bind(safeLimit)
    .all<{
      generated_at: string;
      mismatch_score: number;
      dislocation_state_json: string;
      guardrail_flags_json: string | null;
    }>();

  return result.results;
}

export async function getLatestEngineScore(
  env: Env,
  engineKey: string,
  feedKey: string
): Promise<ScoreRow | null> {
  const row = await env.DB.prepare(
    `
    SELECT engine_key, feed_key, scored_at, score_value, confidence, flags_json, run_key
    FROM scores
    WHERE engine_key = ? AND feed_key = ?
    ORDER BY scored_at DESC
    LIMIT 1
    `
  )
    .bind(engineKey, feedKey)
    .first<ScoreRow>();

  return row ?? null;
}

export async function writeEngineScore(env: Env, input: EngineScoreInput): Promise<void> {
  const flagsJson = JSON.stringify(input.flags);
  await env.DB.prepare(
    `
    INSERT INTO scores (
      engine_key,
      feed_key,
      scored_at,
      score_value,
      confidence,
      flags_json,
      run_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(engine_key, feed_key, scored_at)
    DO UPDATE SET
      score_value = excluded.score_value,
      confidence = excluded.confidence,
      flags_json = excluded.flags_json,
      run_key = excluded.run_key
    `
  )
    .bind(
      input.engineKey,
      input.feedKey,
      input.scoredAt,
      input.scoreValue,
      input.confidence,
      flagsJson,
      input.runKey ?? null
    )
    .run();
}

export async function listActiveRules(
  env: Env,
  engineKey?: string
): Promise<RuleDefinition[]> {
  const query = engineKey
    ? `
      SELECT id, engine_key, rule_key, name, predicate_json, weight, action, is_active
      FROM rules
      WHERE is_active = 1 AND engine_key = ?
      ORDER BY engine_key ASC, rule_key ASC
      `
    : `
      SELECT id, engine_key, rule_key, name, predicate_json, weight, action, is_active
      FROM rules
      WHERE is_active = 1
      ORDER BY engine_key ASC, rule_key ASC
      `;

  const statement = env.DB.prepare(query);
  const result = engineKey
    ? await statement.bind(engineKey).all<{
        id: number;
        engine_key: string;
        rule_key: string;
        name: string;
        predicate_json: string;
        weight: number;
        action: string;
        is_active: number;
      }>()
    : await statement.all<{
        id: number;
        engine_key: string;
        rule_key: string;
        name: string;
        predicate_json: string;
        weight: number;
        action: string;
        is_active: number;
      }>();

  return result.results.map(mapRuleRow);
}

export async function createRule(env: Env, input: CreateRuleInput): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO rules (engine_key, rule_key, name, predicate_json, weight, action, is_active)
    VALUES (?, ?, ?, ?, ?, 'adjust_mismatch', ?)
    `
  )
    .bind(
      input.engineKey,
      input.ruleKey,
      input.name,
      input.predicateJson,
      input.weight,
      input.isActive ? 1 : 0
    )
    .run();
}

export async function updateRuleByKey(
  env: Env,
  engineKey: string,
  ruleKey: string,
  updates: RuleMutationInput
): Promise<void> {
  const existing = await env.DB.prepare(
    `
    SELECT id, engine_key, rule_key, name, predicate_json, weight, action, is_active
    FROM rules
    WHERE engine_key = ? AND rule_key = ?
    LIMIT 1
    `
  )
    .bind(engineKey, ruleKey)
    .first<{
      id: number;
      engine_key: string;
      rule_key: string;
      name: string;
      predicate_json: string;
      weight: number;
      action: string;
      is_active: number;
    }>();

  if (!existing) {
    throw new Error(`Rule not found for ${engineKey}/${ruleKey}`);
  }

  await env.DB.prepare(
    `
    UPDATE rules
    SET
      name = ?,
      predicate_json = ?,
      weight = ?,
      is_active = ?
    WHERE engine_key = ? AND rule_key = ?
    `
  )
    .bind(
      updates.name ?? existing.name,
      updates.predicateJson ?? existing.predicate_json,
      updates.weight ?? existing.weight,
      typeof updates.isActive === "boolean" ? (updates.isActive ? 1 : 0) : existing.is_active,
      engineKey,
      ruleKey
    )
    .run();
}

export async function getRecentSnapshotsForRescore(
  env: Env,
  limit: number
): Promise<Array<{ generated_at: string; mismatch_score: number; subscores_json: string }>> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 250);
  const result = await env.DB.prepare(
    `
    SELECT generated_at, mismatch_score, subscores_json
    FROM signal_snapshots
    ORDER BY generated_at DESC
    LIMIT ?
    `
  )
    .bind(safeLimit)
    .all<{
      generated_at: string;
      mismatch_score: number;
      subscores_json: string;
    }>();

  return result.results;
}

export async function getLedgerEntries(
  env: Env
): Promise<Array<{
  entryKey: string;
  rationale: string;
  impactDirection: "increase" | "decrease";
  createdAt: string;
  retiredAt: string | null;
  reviewDueAt: string;
}>> {
  const result = await env.DB.prepare(
    `
    SELECT entry_key, rationale, impact_direction, created_at, retired_at, review_due_at
    FROM impairment_ledger
    ORDER BY created_at DESC
    `
  ).all<{
    entry_key: string;
    rationale: string;
    impact_direction: "increase" | "decrease";
    created_at: string;
    retired_at: string | null;
    review_due_at: string;
  }>();

  return result.results.map((row) => ({
    entryKey: row.entry_key,
    rationale: row.rationale,
    impactDirection: row.impact_direction,
    createdAt: row.created_at,
    retiredAt: row.retired_at,
    reviewDueAt: row.review_due_at
  }));
}

export async function loadThresholds(env: Env): Promise<ScoringThresholds> {
  const result = await env.DB.prepare(
    `
    SELECT key, value
    FROM config_thresholds
    `
  ).all<ThresholdRow>();

  const rows = new Map<string, number>();
  for (const row of result.results ?? []) {
    rows.set(row.key, Number(row.value));
  }

  const thresholds = {} as ScoringThresholds;
  for (const [propertyKey, rowKey] of THRESHOLD_KEY_MAP) {
    if (!rows.has(rowKey)) {
      throw new AppError(`Missing required threshold: ${rowKey}`, 500, "MISSING_THRESHOLD");
    }

    const value = rows.get(rowKey);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new AppError(`Invalid threshold value for ${rowKey}`, 500, "INVALID_THRESHOLD");
    }

    thresholds[propertyKey] = value;
  }

  return thresholds;
}

export async function getLatestStateChangeEvent(env: Env): Promise<StateChangeEventRow | null> {
  const row = await env.DB.prepare(
    `
    SELECT generated_at, previous_state, new_state, state_transition_duration_seconds, transmission_pressure_changed
    FROM state_change_events
    ORDER BY generated_at DESC
    LIMIT 1
    `
  ).first<StateChangeEventRow>();

  return row ?? null;
}

export async function getFirstNonAlignedStateEvent(env: Env): Promise<StateChangeEventRow | null> {
  const row = await env.DB.prepare(
    `
    SELECT generated_at, previous_state, new_state, state_transition_duration_seconds, transmission_pressure_changed
    FROM state_change_events
    WHERE new_state <> 'aligned'
    ORDER BY generated_at ASC
    LIMIT 1
    `
  ).first<StateChangeEventRow>();

  return row ?? null;
}

export async function getFirstTransmissionEvent(env: Env): Promise<StateChangeEventRow | null> {
  const row = await env.DB.prepare(
    `
    SELECT generated_at, previous_state, new_state, state_transition_duration_seconds, transmission_pressure_changed
    FROM state_change_events
    WHERE transmission_pressure_changed = 1
    ORDER BY generated_at ASC
    LIMIT 1
    `
  ).first<StateChangeEventRow>();

  return row ?? null;
}

export async function writeSateChangeEvent(
  env: Env,
  input: {
    generatedAt: string;
    previousState: string | null;
    newState: string;
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
    ) VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.generatedAt,
      input.previousState,
      input.newState,
      input.stateDurationSeconds,
      input.transmissionChanged ? 1 : 0
    )
    .run();
}

export async function canFlipFlag(env: Env, flagName: string): Promise<boolean> {
  const gates = await getGateStatus(env, flagName);
  return gates.length > 0 && gates.every((gate) => gate.status === "SIGNED_OFF");
}

export async function getGateStatus(env: Env, flagName: string): Promise<PreDeployGateRow[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      flag_name,
      gate_name,
      status,
      signed_off_by,
      signed_off_at,
      expires_at,
      notes,
      last_validated_at,
      validation_result
    FROM pre_deploy_gates
    WHERE flag_name = ?
    ORDER BY gate_name ASC
    `
  )
    .bind(flagName)
    .all<PreDeployGateRow>();

  return result.results;
}

export async function signOffGate(
  env: Env,
  flagName: string,
  gateName: string,
  signedOffBy: string,
  notes?: string
): Promise<void> {
  const signedOffAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `
    INSERT INTO gate_sign_off_history (
      flag_name,
      gate_name,
      signed_off_by,
      signed_off_at,
      expires_at,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?)
    `
  )
    .bind(flagName, gateName, signedOffBy, signedOffAt, expiresAt, notes ?? null)
    .run();

  await env.DB.prepare(
    `
    INSERT INTO pre_deploy_gates (
      flag_name,
      gate_name,
      status,
      signed_off_by,
      signed_off_at,
      expires_at,
      notes,
      updated_at
    ) VALUES (?, ?, 'SIGNED_OFF', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(flag_name, gate_name) DO UPDATE SET
      status = excluded.status,
      signed_off_by = excluded.signed_off_by,
      signed_off_at = excluded.signed_off_at,
      expires_at = excluded.expires_at,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
    `
  )
    .bind(flagName, gateName, signedOffBy, signedOffAt, expiresAt, notes ?? null)
    .run();
}

export async function getGateSignOffHistory(
  env: Env,
  flagName: string,
  gateName: string,
  limit: number
): Promise<GateSignOffHistoryRow[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const result = await env.DB.prepare(
    `
    SELECT signed_off_by, signed_off_at, expires_at, notes
    FROM gate_sign_off_history
    WHERE flag_name = ?
      AND gate_name = ?
    ORDER BY signed_off_at DESC
    LIMIT ?
    `
  )
    .bind(flagName, gateName, safeLimit)
    .all<GateSignOffHistoryRow>();

  return result.results;
}
