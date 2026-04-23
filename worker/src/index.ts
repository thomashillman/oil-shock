import type { Env } from "./env";
import { runPipeline } from "./jobs/run-pipeline";
import { withCors } from "./lib/cors";
import { toAppError } from "./lib/errors";
import { getRuntimeMode, isPhase1ParallelRunningEnabled } from "./lib/feature-flags";
import { json } from "./lib/http";
import { log } from "./lib/logging";
import { handleGetCoverage } from "./routes/coverage";
import { handleGetEvidence } from "./routes/evidence";
import { handleCreateLedger, handleGetLedgerReview, handlePatchLedger } from "./routes/ledger";
import { handleGetState } from "./routes/state";
import { handleGetStateHistory } from "./routes/history";
import { handleBackfillRescore, handleCreateRule, handleListRules, handleRulesDryRun, handleUpdateRule } from "./routes/admin-rules";
import { handleGuardrailFailures } from "./routes/admin-guardrails";
import { handleGetEnergyState } from "./routes/engine-state";
import { handleCompareScorePaths } from "./routes/admin-compare-paths";

interface HealthPayload {
  ok: boolean;
  service: string;
  env: Env["APP_ENV"];
  featureFlags: {
    macroSignals: boolean;
  };
}

function isAuthorizedAdminRequest(request: Request, env: Env): boolean {
  if (!env.ADMIN_API_BEARER_TOKEN) return true;
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${env.ADMIN_API_BEARER_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
          env: env.APP_ENV,
          featureFlags: {
            macroSignals: getRuntimeMode(env) === "macro-signals"
          }
        };
        response = json(payload);
        return withCors(response, request, env);
      }

      if (request.method === "GET" && pathname === "/api/state") {
        response = await handleGetState(env);
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
      if (request.method === "GET" && pathname === "/api/ledger/review") {
        response = await handleGetLedgerReview(env);
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
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        ctx.waitUntil(runPipeline(env));
        response = json({ ok: true, triggered: true });
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/rules") {
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        response = await handleListRules(env);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/rules") {
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        response = await handleCreateRule(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "PATCH" && pathname.startsWith("/api/admin/rules/")) {
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        const ruleKey = pathname.split("/").at(-1) ?? "";
        response = await handleUpdateRule(request, env, ruleKey);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/rules/dry-run") {
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        response = await handleRulesDryRun(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/guardrails/failures") {
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        response = await handleGuardrailFailures(env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/compare-score-paths") {
        if (!isPhase1ParallelRunningEnabled(env)) {
          response = json(
            { error: "not_available", message: "Comparison endpoint is only available when Phase 1 parallel running is enabled." },
            { status: 404 }
          );
          return withCors(response, request, env);
        }
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        response = await handleCompareScorePaths(env);
        return withCors(response, request, env);
      }
      if (request.method === "POST" && pathname === "/api/admin/backfill/rescore") {
        if (!isAuthorizedAdminRequest(request, env)) {
          response = json({ error: "unauthorized", message: "Missing or invalid admin bearer token." }, { status: 401 });
          return withCors(response, request, env);
        }
        response = await handleBackfillRescore(request, env);
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/v1/energy/state") {
        response = await handleGetEnergyState(env);
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
    await runPipeline(env);
  }
};
