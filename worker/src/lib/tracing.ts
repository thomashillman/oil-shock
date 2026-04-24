export interface RequestContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
}

let currentContext: RequestContext | null = null;

export function generateRequestId(): string {
  // Generate a URL-safe request ID using timestamp + random component
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

export function extractTraceContext(request: Request): Partial<RequestContext> {
  const context: Partial<RequestContext> = {};

  // Extract W3C Trace Context headers (standard for OTEL)
  const traceParent = request.headers.get("traceparent");
  if (traceParent) {
    const parts = traceParent.split("-");
    if (parts.length >= 3) {
      context.traceId = parts[1];
      context.spanId = parts[2];
    }
  }

  // Fallback to Jaeger headers if W3C headers not present
  if (!context.traceId) {
    const uberTraceId = request.headers.get("uber-trace-id");
    if (uberTraceId) {
      const parts = uberTraceId.split(":");
      if (parts.length > 0) {
        context.traceId = parts[0];
      }
    }
  }

  return context;
}

export function setRequestContext(context: RequestContext): void {
  currentContext = context;
}

export function getRequestContext(): RequestContext | null {
  return currentContext;
}

export function clearRequestContext(): void {
  currentContext = null;
}
