import type { Env } from "./env";
import { runCollection } from "./jobs/collect";
import { runScore } from "./jobs/score";
import { withCors } from "./lib/cors";
import { toAppError } from "./lib/errors";
import { json } from "./lib/http";
import { log } from "./lib/logging";
import { isPhase1ParallelRunningEnabled } from "./lib/feature-flags";
import { handleGetApiHealth } from "./routes/admin-api-health";
import { handleCompareScorePaths } from "./routes/admin-compare-paths";
import { handleGetGateHistory, handleGetGateStatus, handleSignOffGate } from "./routes/admin-gates";
import { handleGuardrailFailures } from "./routes/admin-guardrails";
import { handleGetRolloutStatus } from "./routes/admin-rollout";
import { handleGetRolloutReadiness } from "./routes/admin-rollout-readiness";
import {
  handleBackfillRescore,
  handleCreateRule,
  handleListRules,
  handleRulesCompare,
  handleRulesDryRun,
  handleUpdateRule
} from "./routes/admin-rules";
import { handleGetValidationStatus } from "./routes/admin-validation";
import { handleGetCoverage } from "./routes/coverage";
import { handleGetEvidence } from "./routes/evidence";
import { handleGetFeedHealth } from "./routes/feed-health";
import { handleEngineList, handleEnergyRuntime, handleRuntimeMethodNotAllowed, handleUnknownRuntimeEngine } from "./routes/engine-runtime";
import { handleGetEnergyState } from "./routes/engine-state";
import { handleGetStateHistory } from "./routes/history";
import { handleCreateLedger, handleGetLedgerReview, handlePatchLedger } from "./routes/ledger";
import { handleGetState } from "./routes/state";

interface HealthPayload {
  ok: boolean;
  service: string;
  env: Env["APP_ENV"];
}

function isAuthorizedAdminRequest(request: Request, env: Env): boolean {
  const token = env.ADMIN_API_BEARER_TOKEN;
  if (!token) {
    return true;
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return false;
  }

  return authorization.slice("Bearer ".length) === token;
}

function denyUnauthorized(request: Request, env: Env): Response | null {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/admin/compare-score-paths" && !isPhase1ParallelRunningEnabled(env)) {
    return null;
  }

  if (isAuthorizedAdminRequest(request, env)) {
    return null;
  }

  return json(
    {
      error: "unauthorized",
      message: "Missing or invalid bearer token."
    },
    { status: 401 }
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    const { pathname } = new URL(request.url);
    let response: Response;

    try {
      if (pathname === "/health") {
        const payload: HealthPayload = {
          ok: true,
          service: "oil-shock-worker",
          env: env.APP_ENV
        };
        response = json(payload);
        return withCors(response, request, env);
      }

      if (pathname.startsWith("/api/admin/")) {
        const unauthorized = denyUnauthorized(request, env);
        if (unauthorized) {
          return withCors(unauthorized, request, env);
        }
      }

      if (request.method === "GET" && pathname === "/api/state") {
        response = await handleGetState(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/state/history") {
        response = await handleGetStateHistory(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/evidence") {
        response = await handleGetEvidence(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/coverage") {
        response = await handleGetCoverage(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/v1/energy/state") {
        response = await handleGetEnergyState(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/ledger/review") {
        response = await handleGetLedgerReview(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/feed-health") {
        response = await handleGetFeedHealth(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/engines") {
        response = await handleEngineList();
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/engines/energy/runtime") {
        response = await handleEnergyRuntime(env);
        return withCors(response, request, env);
      }
      if (request.method !== "GET" && pathname.startsWith("/api/engines/") && pathname.endsWith("/runtime")) {
        response = handleRuntimeMethodNotAllowed();
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname.startsWith("/api/engines/")) {
        const engineKey = pathname.split("/")[3] ?? "";
        response = handleUnknownRuntimeEngine(engineKey);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/ledger") {
        response = await handleCreateLedger(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "PATCH" && pathname.startsWith("/api/ledger/")) {
        const id = pathname.split("/").at(-1) ?? "";
        response = await handlePatchLedger(request, env, id);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/run-poc") {
        await runCollection(env);
        await runScore(env);
        response = json({ ok: true });
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/api-health") {
        response = await handleGetApiHealth(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/compare-score-paths") {
        response = await handleCompareScorePaths(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/gates") {
        response = await handleGetGateStatus(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/gates/sign-off") {
        response = await handleSignOffGate(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/gates/history") {
        response = await handleGetGateHistory(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/guardrails/failures") {
        response = await handleGuardrailFailures(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/rollout-status") {
        response = await handleGetRolloutStatus(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/rollout-readiness") {
        response = await handleGetRolloutReadiness(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/validation-status") {
        response = await handleGetValidationStatus(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/rules") {
        response = await handleListRules(env);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/rules") {
        response = await handleCreateRule(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "PATCH" && pathname.startsWith("/api/admin/rules/")) {
        const ruleKey = pathname.split("/").at(-1) ?? "";
        response = await handleUpdateRule(request, env, ruleKey);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/rules/dry-run") {
        response = await handleRulesDryRun(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/rules/compare") {
        response = await handleRulesCompare(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/backfill/rescore") {
        response = await handleBackfillRescore(request, env);
        return withCors(response, request, env);
      }

      response = json(
        {
          error: "not_found",
          message: "Route not found."
        },
        { status: 404 }
      );
      return withCors(response, request, env);
    } catch (error) {
      const appError = toAppError(error);
      log("error", "Unhandled request error", { path: pathname, code: appError.code });
      response = json({ error: appError.code, message: appError.message }, { status: appError.status });
      return withCors(response, request, env);
    }
  },
  async scheduled(_: ScheduledController, env: Env): Promise<void> {
    await runCollection(env);
    await runScore(env);
  }
};
