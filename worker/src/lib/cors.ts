import type { Env } from "../env";

const BASE_ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function isPreviewOrigin(origin: string): boolean {
  try {
    return /\.vercel\.app$/i.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string, env: Env): boolean {
  if (BASE_ALLOWED_ORIGINS.has(origin)) {
    return true;
  }
  if (isPreviewOrigin(origin)) {
    return true;
  }
  if (env.APP_ENV === "production" && env.PRODUCTION_ORIGIN) {
    return origin === env.PRODUCTION_ORIGIN;
  }
  return false;
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("origin");
  if (!origin) {
    return response;
  }
  if (!isAllowedOrigin(origin, env)) {
    return new Response(JSON.stringify({ error: "forbidden_origin" }), {
      status: 403,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
  }
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("vary", "origin");
  response.headers.set("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  response.headers.set("access-control-allow-headers", "content-type");
  return response;
}
