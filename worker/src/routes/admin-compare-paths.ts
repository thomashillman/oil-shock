import type { Env } from "../env";
import { json } from "../lib/http";

interface SnapshotVersion {
  mismatchScore: number;
  confidence: number;
  dislocationState: string;
  flagCount: number;
}

interface ScoresTableVersion {
  scoreValue: number;
  confidence: number;
  flags: string[];
}

interface ComparisonResult {
  scoreDiff: number;
  confidenceDiff: number;
  flagsMatch: boolean;
  stateMatch: boolean;
}

interface ComparePathsResponse {
  snapshotVersion: SnapshotVersion | null;
  scoresTableVersion: ScoresTableVersion | null;
  comparison: ComparisonResult | null;
  observedAt: string;
  message?: string;
}

export async function handleCompareScorePaths(env: Env): Promise<Response> {
  try {
    const observedAt = new Date().toISOString();

    const snapshotRow = await env.DB.prepare(
      `
      SELECT
        mismatch_score,
        coverage_confidence,
        dislocation_state_json,
        guardrail_flags_json
      FROM signal_snapshots
      ORDER BY generated_at DESC
      LIMIT 1
      `
    ).first<{
      mismatch_score: number;
      coverage_confidence: number;
      dislocation_state_json: string;
      guardrail_flags_json: string | null;
    }>();

    const scoresRow = await env.DB.prepare(
      `
      SELECT
        score_value,
        confidence,
        flags_json
      FROM scores
      WHERE engine_key = 'oil_shock' AND feed_key = 'oil_shock.mismatch_score'
      ORDER BY scored_at DESC
      LIMIT 1
      `
    ).first<{
      score_value: number;
      confidence: number;
      flags_json: string;
    }>();

    let snapshotVersion: SnapshotVersion | null = null;
    let scoresTableVersion: ScoresTableVersion | null = null;
    let comparison: ComparisonResult | null = null;

    if (snapshotRow) {
      let dislocationState = "unknown";
      try {
        const parsed = JSON.parse(snapshotRow.dislocation_state_json);
        dislocationState = typeof parsed === "string" ? parsed : parsed.state || "unknown";
      } catch {
        // Leave as unknown
      }

      let flags: string[] = [];
      if (snapshotRow.guardrail_flags_json) {
        try {
          const parsed = JSON.parse(snapshotRow.guardrail_flags_json);
          flags = Array.isArray(parsed) ? parsed : [];
        } catch {
          // Leave empty
        }
      }

      snapshotVersion = {
        mismatchScore: snapshotRow.mismatch_score,
        confidence: snapshotRow.coverage_confidence,
        dislocationState,
        flagCount: flags.length
      };
    }

    if (scoresRow) {
      let flags: string[] = [];
      try {
        const parsed = JSON.parse(scoresRow.flags_json);
        flags = parsed.guardrailFlags || [];
      } catch {
        // Leave empty
      }

      scoresTableVersion = {
        scoreValue: scoresRow.score_value,
        confidence: scoresRow.confidence,
        flags
      };
    }

    // Compute comparison if both versions exist
    if (snapshotVersion && scoresTableVersion) {
      const scoreDiff = Math.abs(snapshotVersion.mismatchScore - scoresTableVersion.scoreValue);
      const confidenceDiff = Math.abs(snapshotVersion.confidence - scoresTableVersion.confidence);

      comparison = {
        scoreDiff,
        confidenceDiff,
        flagsMatch: snapshotVersion.flagCount === scoresTableVersion.flags.length,
        stateMatch: snapshotVersion.dislocationState === (
          // Extract state from scoresTableVersion flags
          (() => {
            try {
              const row = scoresRow!;
              const parsed = JSON.parse(row.flags_json);
              return parsed.state || "unknown";
            } catch {
              return "unknown";
            }
          })()
        )
      };
    }

    const response: ComparePathsResponse = {
      snapshotVersion,
      scoresTableVersion,
      comparison,
      observedAt,
      message: !snapshotVersion ? "No snapshot found" : !scoresTableVersion ? "No scores row found" : "Comparison complete"
    };

    return json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(
      { error: "comparison_failed", message },
      { status: 500 }
    );
  }
}
