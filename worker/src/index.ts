import type { Env } from "./env";
import { runCollection } from "./jobs/collect";
import { runScore } from "./jobs/score";
import { finishRun, startRun } from "./db/client";
import { withCors } from "./lib/cors";
import { toAppError } from "./lib/errors";
import { json } from "./lib/http";
import { log } from "./lib/logging";
import { handleGetCoverage } from "./routes/coverage";
import { handleGetEvidence } from "./routes/evidence";
import { handleCreateLedger, handleGetLedgerReview, handlePatchLedger } from "./routes/ledger";
import { handleGetState } from "./routes/state";
import { handleGetStateHistory } from "./routes/history";
import { handleGetRunStatus } from "./routes/run-status";

interface HealthPayload {
  ok: boolean;
  service: string;
  env: Env["APP_ENV"];
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
          env: env.APP_ENV
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
        const runKey = `admin-recalc-${Date.now()}`;
        const requestId = request.headers.get("x-request-id") ?? request.headers.get("cf-ray") ?? crypto.randomUUID();
        const requestMeta = {
          runKey,
          requestId,
          method: request.method,
          path: pathname,
          userAgent: request.headers.get("user-agent")
        };

        ctx.waitUntil((async () => {
          await startRun(env, runKey, "admin_recalc");
          log("info", "Admin recalculation started", requestMeta);
          try {
            await runCollection(env);
            await runScore(env);
            await finishRun(env, runKey, "success", { requestId });
            log("info", "Admin recalculation completed", requestMeta);
          } catch (error) {
            const appError = toAppError(error);
            await finishRun(env, runKey, "failed", {
              requestId,
              code: appError.code,
              error: appError.message
            });
            log("error", "Admin recalculation failed", {
              ...requestMeta,
              code: appError.code,
              error: appError.message
            });
          }
        })());
        response = json({ ok: true, triggered: true, runKey });
        return withCors(response, request, env);
      }
      if (request.method === "GET" && pathname === "/api/admin/run-status") {
        response = await handleGetRunStatus(request, env);
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
