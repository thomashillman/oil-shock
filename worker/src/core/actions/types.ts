import type { TriggerEventRow } from "../../db/macro";

export type ActionDecision = "allowed" | "blocked" | "ignored" | "error";

export interface ActionDecisionDraft {
  engineKey: string;
  ruleKey?: string | null;
  releaseKey?: string | null;
  decisionKey: string;
  decision: ActionDecision;
  actionType: string;
  rationale: string;
  details?: Record<string, unknown> | null;
}

export interface ActionCandidate {
  triggerEvent: TriggerEventRow;
}

export interface ActionManagerResult {
  processedCount: number;
  skippedCount: number;
  allowedCount: number;
  blockedCount: number;
  ignoredCount: number;
  errorCount: number;
}
