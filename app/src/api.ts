import { apiBaseUrl } from "./config";

export interface StatePayload {
  generated_at: string;
  mismatch_score: number;
  actionability_state: "none" | "watch" | "actionable";
  coverage_confidence: number;
  source_freshness: {
    physical: string;
    recognition: string;
    transmission: string;
  };
  evidence_ids: string[];
}

export interface EvidencePayload {
  generated_at: string;
  evidence: Array<{
    evidence_key: string;
    evidence_group: string;
    observed_at: string;
    contribution: number;
    details_json?: string;
  }>;
}

export interface CoveragePayload {
  generated_at: string;
  coverage_confidence: number;
  source_freshness: {
    physical: string;
    recognition: string;
    transmission: string;
  };
}

export interface LedgerReviewPayload {
  review_due: Array<{
    id: number;
    entry_key: string;
    rationale: string;
    impact_direction: "increase" | "decrease";
    review_due_at: string;
  }>;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new ApiError(payload?.message ?? `Request failed for ${path}`, response.status);
  }
  return payload as T;
}

export function fetchState(): Promise<StatePayload> {
  return request<StatePayload>("/api/state");
}

export function fetchEvidence(): Promise<EvidencePayload> {
  return request<EvidencePayload>("/api/evidence");
}

export function fetchCoverage(): Promise<CoveragePayload> {
  return request<CoveragePayload>("/api/coverage");
}

export function fetchLedgerReview(): Promise<LedgerReviewPayload> {
  return request<LedgerReviewPayload>("/api/ledger/review");
}

export function runPocCycle(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/admin/run-poc", { method: "POST" });
}
