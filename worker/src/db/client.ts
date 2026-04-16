import type { Env } from "../env";
import type { NormalizedPoint, ScoreEvidence, StateSnapshot } from "../types";

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

export async function writeSnapshot(env: Env, snapshot: StateSnapshot): Promise<number> {
  const result = await env.DB.prepare(
    `
    INSERT INTO signal_snapshots (
      generated_at,
      mismatch_score,
      actionability_state,
      coverage_confidence,
      source_freshness_json,
      evidence_ids_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      snapshot.generatedAt,
      snapshot.mismatchScore,
      snapshot.actionabilityState,
      snapshot.coverageConfidence,
      JSON.stringify(snapshot.sourceFreshness),
      JSON.stringify(snapshot.evidenceIds)
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
        details_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        runKey,
        evidence.evidenceKey,
        evidence.evidenceGroup,
        evidence.observedAt,
        evidence.contribution,
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
  }>();
  return row ?? null;
}

export async function getLatestRunEvidence(env: Env) {
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

  const result = await env.DB.prepare(
    `
    SELECT evidence_key, evidence_group, observed_at, contribution, details_json
    FROM run_evidence
    WHERE run_key = ?
    ORDER BY observed_at DESC
    `
  )
    .bind(run.run_key)
    .all<{
      evidence_key: string;
      evidence_group: string;
      observed_at: string;
      contribution: number;
      details_json: string;
    }>();

  return result.results;
}
