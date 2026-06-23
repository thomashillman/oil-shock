import type { Env } from "../env";
import { json } from "../lib/http";
import { getGateStatus } from "../db/client";

export interface ValidationGateStatus {
  gate: string;
  status: "passed" | "pending" | "failed";
  lastCheckedAt?: string;
  details?: string;
}

export async function handleGetValidationStatus(env: Env): Promise<Response> {
  const gates = await getGateStatus(env, "ENABLE_MACRO_SIGNALS");

  const gateStatuses: ValidationGateStatus[] = gates.map((g) => ({
    gate: g.gate_name,
    status:
      g.status === "SIGNED_OFF"
        ? "passed"
        : g.status === "EXPIRED"
          ? "failed"
          : "pending",
    lastCheckedAt: g.signed_off_at ?? undefined,
    details: g.notes ?? undefined
  }));

  const allPassed = gates.every((g) => g.status === "SIGNED_OFF");
  const allReady = !gates.some((g) => g.status === "EXPIRED");

  return json({
    feature: "ENABLE_MACRO_SIGNALS",
    gateCount: gateStatuses.length,
    passedCount: gateStatuses.filter((g) => g.status === "passed").length,
    pendingCount: gateStatuses.filter((g) => g.status === "pending").length,
    failedCount: gateStatuses.filter((g) => g.status === "failed").length,
    allValidationsPassed: allPassed,
    readyForRollout: allReady,
    gates: gateStatuses,
    timestamp: new Date().toISOString()
  });
}
