import type { Env } from "../env";
import { getGateStatus, canFlipFlag, signOffGate, getGateSignOffHistory } from "../db/client";
import { json, parseJsonBody } from "../lib/http";
import { AppError } from "../lib/errors";

export async function handleGetGateStatus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const flagName = url.searchParams.get("flagName") ?? "ENABLE_MACRO_SIGNALS";

  if (!flagName || typeof flagName !== "string") {
    throw new AppError("flagName parameter is required", 400, "BAD_REQUEST");
  }

  const gates = await getGateStatus(env, flagName);
  const canFlip = await canFlipFlag(env, flagName);
  const blockedGates = gates.filter(g => g.status !== "SIGNED_OFF");

  return json({
    flagName,
    canFlip,
    blockingReasons: blockedGates.map(g => {
      if (g.status === "EXPIRED") {
        return `Gate '${g.gate_name}' expired on ${g.expires_at}. Requires re-validation.`;
      }
      if (g.status === "PENDING") {
        return `Gate '${g.gate_name}' not signed off`;
      }
      return `Gate '${g.gate_name}' has unknown status`;
    }),
    gates: gates.map(g => ({
      name: g.gate_name,
      status: g.status,
      signedOffBy: g.signed_off_by,
      signedOffAt: g.signed_off_at,
      expiresAt: g.expires_at,
      notes: g.notes,
      lastValidatedAt: g.last_validated_at,
      validationResult: g.validation_result
    }))
  });
}

export async function handleSignOffGate(request: Request, env: Env): Promise<Response> {
  const body = await parseJsonBody<Record<string, unknown>>(request);

  const flagName = body.flagName;
  const gateName = body.gateName;
  const signedOffBy = body.signedOffBy;
  const notes = body.notes;

  if (typeof flagName !== "string" || !flagName.trim()) {
    throw new AppError("flagName is required", 400, "BAD_REQUEST");
  }

  if (typeof gateName !== "string" || !gateName.trim()) {
    throw new AppError("gateName is required", 400, "BAD_REQUEST");
  }

  if (typeof signedOffBy !== "string" || !signedOffBy.trim()) {
    throw new AppError("signedOffBy (team name) is required", 400, "BAD_REQUEST");
  }

  await signOffGate(env, flagName, gateName, signedOffBy, typeof notes === "string" ? notes : undefined);

  return json({ success: true, message: `Gate '${gateName}' signed off by ${signedOffBy}` });
}

export async function handleGetGateHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const flagName = url.searchParams.get("flagName") ?? "ENABLE_MACRO_SIGNALS";
  const gateName = url.searchParams.get("gateName");
  const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);

  if (!flagName || typeof flagName !== "string") {
    throw new AppError("flagName parameter is required", 400, "BAD_REQUEST");
  }

  if (!gateName || typeof gateName !== "string") {
    throw new AppError("gateName parameter is required", 400, "BAD_REQUEST");
  }

  if (isNaN(limit) || limit < 1 || limit > 100) {
    throw new AppError("limit must be between 1 and 100", 400, "BAD_REQUEST");
  }

  const history = await getGateSignOffHistory(env, flagName, gateName, limit);

  return json({
    flagName,
    gateName,
    history: history.map(h => ({
      signedOffBy: h.signed_off_by,
      signedOffAt: h.signed_off_at,
      expiresAt: h.expires_at,
      notes: h.notes
    }))
  });
}
