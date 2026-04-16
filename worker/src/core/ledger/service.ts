import type { Env } from "../../env";
import { AppError } from "../../lib/errors";
import type { LedgerEntryInput } from "../../types";

interface LedgerPatchInput {
  rationale?: string;
  impact_direction?: "increase" | "decrease";
  review_due_at?: string;
  retired_at?: string | null;
}

export async function listReviewDue(env: Env) {
  const result = await env.DB.prepare(
    `
    SELECT id, entry_key, rationale, impact_direction, review_due_at, retired_at, updated_at
    FROM impairment_ledger
    WHERE retired_at IS NULL
      AND review_due_at <= ?
    ORDER BY review_due_at ASC
    `
  )
    .bind(new Date().toISOString())
    .all();
  return result.results;
}

export async function createLedgerEntry(env: Env, payload: LedgerEntryInput): Promise<void> {
  if (!payload.key || !payload.rationale || !payload.reviewDueAt) {
    throw new AppError("key, rationale, and reviewDueAt are required.", 400, "validation_error");
  }
  if (payload.impactDirection !== "increase" && payload.impactDirection !== "decrease") {
    throw new AppError("impactDirection must be 'increase' or 'decrease'.", 400, "validation_error");
  }

  await env.DB.prepare(
    `
    INSERT INTO impairment_ledger (entry_key, rationale, impact_direction, review_due_at)
    VALUES (?, ?, ?, ?)
    `
  )
    .bind(payload.key, payload.rationale, payload.impactDirection, payload.reviewDueAt)
    .run();
}

export async function updateLedgerEntry(env: Env, id: string, payload: LedgerPatchInput): Promise<void> {
  if (!id) {
    throw new AppError("Ledger id is required.", 400, "validation_error");
  }

  await env.DB.prepare(
    `
    UPDATE impairment_ledger
    SET
      rationale = COALESCE(?, rationale),
      impact_direction = COALESCE(?, impact_direction),
      review_due_at = COALESCE(?, review_due_at),
      retired_at = COALESCE(?, retired_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `
  )
    .bind(
      payload.rationale ?? null,
      payload.impact_direction ?? null,
      payload.review_due_at ?? null,
      payload.retired_at ?? null,
      id
    )
    .run();
}
