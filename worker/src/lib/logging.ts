import { getRequestContext } from "./tracing";

export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const requestContext = getRequestContext();
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(requestContext ? { req_id: requestContext.requestId } : {}),
    ...(context ?? {})
  };
  console.log(JSON.stringify(payload));
}
