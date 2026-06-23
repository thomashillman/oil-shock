import type { Env } from "../env";
import { AppError } from "../lib/errors";
import type { NormalizedPoint, ScoreEvidence, StateSnapshot } from "../types";
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
    dislocation_state_json?: string | null;
    state_rationale?: string | null;
    subscores_json?: string | null;
    clocks_json?: string | null;
    ledger_impact_json?: string | null;
    guardrail_flags_json?: string | null;
    run_key?: string | null;
  }>();
  return row ?? null;
}

export async function getSnapshotHistory(
  env: Env,
  limit: number
): Promise<
  Array<{
    generated_at: string;
    mismatch_score: number;
    dislocation_state_json?: string | null;
  }>
> {
  const result = await env.DB.prepare(
    `
    SELECT generated_at, mismatch_score, dislocation_state_json
    FROM signal_snapshots
    ORDER BY generated_at DESC
    LIMIT ?
    `
  )
    .bind(limit)
    .all<{
      generated_at: string;
      mismatch_score: number;
      dislocation_state_json?: string | null;
    }>();
  return result.results;
}

export async function getRunEvidenceBySnapshotRunKey(
  env: Env,
  snapshotRunKey: string | null | undefined
): Promise<
  Array<{
    evidence_key: string;
    evidence_group: string;
    observed_at: string;
    contribution: number;
    evidence_classification?: string | null;
    coverage_quality?: string | null;
    evidence_group_label?: string | null;
    details_json: string;
  }>
> {
  const runKey =
    snapshotRunKey ??
    (await env.DB.prepare(
      `
      SELECT run_key
      FROM runs
      WHERE run_type = 'score'
      ORDER BY started_at DESC
      LIMIT 1
      `
    ).first<{ run_key: string }>())?.run_key;

  if (!runKey) {
    return [];
  }

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
      evidence_classification?: string | null;
      coverage_quality?: string | null;
      evidence_group_label?: string | null;
      details_json: string;
    }>();

  return result.results;
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

export async function createRule(
  env: Env,
  input: {
    engineKey: string;
    ruleKey: string;
    name: string;
    predicateJson: string;
    weight: number;
    isActive: boolean;
  }
): Promise<void> {
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
  updates: { weight?: number; predicateJson?: string; isActive?: boolean }
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE rules
    SET
      weight = COALESCE(?, weight),
      predicate_json = COALESCE(?, predicate_json),
      is_active = COALESCE(?, is_active)
    WHERE engine_key = ? AND rule_key = ?
    `
  )
    .bind(
      updates.weight ?? null,
      updates.predicateJson ?? null,
      typeof updates.isActive === "boolean" ? (updates.isActive ? 1 : 0) : null,
      engineKey,
      ruleKey
    )
    .run();
}

export async function getRecentSnapshotsForRescore(
  env: Env,
  limit: number
): Promise<Array<{ generated_at: string; mismatch_score: number; subscores_json?: string | null }>> {
  const result = await env.DB.prepare(
    `
    SELECT generated_at, mismatch_score, subscores_json
    FROM signal_snapshots
    ORDER BY generated_at DESC
    LIMIT ?
    `
  )
    .bind(limit)
    .all<{ generated_at: string; mismatch_score: number; subscores_json?: string | null }>();

  return result.results;
}
