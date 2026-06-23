export const json = (payload: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: (() => {
      const headers = new Headers(init?.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json; charset=utf-8");
      }
      if (!headers.has("cache-control")) {
        headers.set("cache-control", "no-store, no-cache, must-revalidate");
      }
      if (!headers.has("pragma")) {
        headers.set("pragma", "no-cache");
      }
      return headers;
    })()
  });

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}
