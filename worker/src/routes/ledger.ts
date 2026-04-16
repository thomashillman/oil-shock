import type { Env } from "../env";
import { createLedgerEntry, listReviewDue, updateLedgerEntry } from "../core/ledger/service";
import { toAppError } from "../lib/errors";
import { json, parseJsonBody } from "../lib/http";
import type { LedgerEntryInput } from "../types";

interface LedgerPatchInput {
  rationale?: string;
  impact_direction?: "increase" | "decrease";
  review_due_at?: string;
  retired_at?: string | null;
}

export async function handleGetLedgerReview(env: Env): Promise<Response> {
  try {
    const reviewDue = await listReviewDue(env);
    return json({
      review_due: reviewDue
    });
  } catch (error) {
    const appError = toAppError(error);
    return json({ error: appError.code, message: appError.message }, { status: appError.status });
  }
}

export async function handleCreateLedger(request: Request, env: Env): Promise<Response> {
  try {
    const payload = await parseJsonBody<LedgerEntryInput>(request);
    await createLedgerEntry(env, payload);
    return json({ ok: true }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    return json({ error: appError.code, message: appError.message }, { status: appError.status });
  }
}

export async function handlePatchLedger(request: Request, env: Env, id: string): Promise<Response> {
  try {
    const payload = await parseJsonBody<LedgerPatchInput>(request);
    await updateLedgerEntry(env, id, payload);
    return json({ ok: true });
  } catch (error) {
    const appError = toAppError(error);
    return json({ error: appError.code, message: appError.message }, { status: appError.status });
  }
}
