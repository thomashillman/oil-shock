function getApiBaseUrl(): string {
  // Use explicitly configured URL if available
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // For local development
  if (!import.meta.env.PROD) {
    return "http://127.0.0.1:8787";
  }

  // For production on Vercel, check deployment environment
  const vercelEnv = import.meta.env.VERCEL_ENV ?? "production";
  if (vercelEnv === "preview") {
    return "https://energy-dislocation-engine-preview.tj-hillman.workers.dev";
  }

  return "https://energy-dislocation-engine-production.tj-hillman.workers.dev";
}

export const apiBaseUrl = getApiBaseUrl();
