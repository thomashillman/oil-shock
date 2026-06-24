import { log } from "./logging";

export interface FetchOptions {
  timeout?: number;
  retries?: number;
  backoffMs?: number;
  rateLimitDelayMs?: number;
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 0;
const DEFAULT_BACKOFF_MS = 2000;
const DEFAULT_RATE_LIMIT_DELAY_MS = 150;

let lastFetchTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchJson<T>(
  url: string,
  options: FetchOptions & { headers?: Record<string, string> } = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    rateLimitDelayMs = DEFAULT_RATE_LIMIT_DELAY_MS,
    headers = {}
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Rate limiting: enforce minimum delay between requests
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < rateLimitDelayMs) {
        await sleep(rateLimitDelayMs - timeSinceLastFetch);
      }

      lastFetchTime = Date.now();

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          ...headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as T;
      clearTimeout(timeoutId);
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const delayMs = backoffMs * Math.pow(2, attempt);
        log("warn", `Fetch attempt ${attempt + 1} failed, retrying in ${delayMs}ms`, {
          url,
          error: lastError.message,
          nextAttempt: attempt + 2
        });
        await sleep(delayMs);
      }
    }
  }

  clearTimeout(timeoutId);
  throw lastError ?? new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

export async function fetchText(
  url: string,
  options: FetchOptions & { headers?: Record<string, string> } = {}
): Promise<string> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    rateLimitDelayMs = DEFAULT_RATE_LIMIT_DELAY_MS,
    headers = {}
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < rateLimitDelayMs) {
        await sleep(rateLimitDelayMs - timeSinceLastFetch);
      }

      lastFetchTime = Date.now();

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept-Encoding": "gzip, deflate",
          ...headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      clearTimeout(timeoutId);
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const delayMs = backoffMs * Math.pow(2, attempt);
        log("warn", `Text fetch attempt ${attempt + 1} failed, retrying in ${delayMs}ms`, {
          url,
          error: lastError.message,
          nextAttempt: attempt + 2
        });
        await sleep(delayMs);
      }
    }
  }

  clearTimeout(timeoutId);
  throw lastError ?? new Error(`Failed to fetch text from ${url} after ${retries + 1} attempts`);
}
